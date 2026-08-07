// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Share/import ANY report as a portable ECBT key (.ecbt). Generaliza o export de
// templates AI para relatórios em geral (pedido Calvin). DOM helpers + encodeKey/decodeKey.
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';

const log = createLogger('ReportShareEcbt');

function _slug(s: unknown): string {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

/**
 * Constrói uma chave ECBT (tipo A) carregando um relatório como payload.
 * Wrapper {_kind:'report', report:{title,content}, elements:[]} — encodeKey serializa/cifra.
 * Importável por decodeKey + importReportEcbtKey (kind-aware).
 */
export async function buildReportEcbtKey(report: any): Promise<string> {
    const { encodeKey } = await import('../../core/io/encoder.js' as string);
    const wrapper = {
        ecbyts: '2.0.0',
        _kind: 'report',
        report: {
            title: report?.title || '',
            content: report?.content || '',
            lastModified: report?.lastModified || null,
        },
        elements: [],
        campaigns: [],
        scenes: [],
    };
    return encodeKey(wrapper);
}

function _download(text: string, filename: string): void {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exporta o relatório ativo como .ecbt — pergunta destino (Library ecbyts | local). */
export async function exportActiveReportEcbt(): Promise<boolean> {
    try {
        const mgr: any = await import('./manager.js' as string);
        const report = mgr.getReport?.();
        if (!report || (!report.title && !report.content)) {
            showToast(t('report.share.empty') || 'Relatório vazio — nada para exportar', 'warning');
            return false;
        }
        const lib: any = await import('./_ecbtLibraryStore.js' as string);
        const target = await lib.chooseEcbtTarget('export');
        if (!target) return false;
        const key = await buildReportEcbtKey(report);
        const name = report.title || (t('report.share.importedTitle') || 'Relatório');
        if (target === 'library') {
            const ok = await lib.saveEcbtToLibrary({ id: `report-${_slug(name) || _ts()}`, kind: 'report', name, key });
            showToast(ok ? (t('ecbtLib.savedLibrary') || 'Salvo na Library ecbyts') : (t('report.share.exportFailed') || 'Falha'), ok ? 'success' : 'error');
            return ok;
        }
        _download(key, `${_slug(name) || 'report'}.ecbt`);
        showToast(t('report.share.customReportSaved') || 'O custom report foi salvo.', 'success');
        return true;
    } catch (err: any) {
        log.error('export report ecbt failed:', err?.message || err);
        showToast(t('report.share.exportFailed') || 'Falha ao gerar .ecbt', 'error');
        return false;
    }
}

function _ts(): string {
    return (typeof performance !== 'undefined' && performance.now ? String(Math.floor(performance.now())) : 'k');
}

/** Decodifica uma chave .ecbt de relatório e adiciona como novo relatório. */
export async function importReportEcbtKey(key: string): Promise<boolean> {
    try {
        const trimmed = String(key || '').trim();
        if (!trimmed.startsWith('ECBT.')) {
            showToast(t('report.share.invalidKey') || 'Chave .ecbt inválida', 'error');
            return false;
        }
        const dec: any = await import('../../core/io/decoder.js' as string);
        const model = await (dec.decodeKey ? dec.decodeKey(trimmed) : null);
        if (!model || model._kind !== 'report' || !model.report) {
            showToast(t('report.share.notReport') || 'Esta chave não contém um relatório', 'error');
            return false;
        }
        const mgr: any = await import('./manager.js' as string);
        const folderId = mgr.getRootFolders?.()[0]?.id;
        const created = mgr.addReport?.(folderId, {
            title: model.report.title || t('report.share.importedTitle') || 'Relatório importado',
            content: model.report.content || '',
        });
        if (!created) {
            showToast(t('report.share.importFailed') || 'Falha ao importar relatório', 'error');
            return false;
        }
        mgr.setActiveReport?.(created.id);
        try {
            const ed: any = await import('./editor.js' as string);
            ed.updateReportEditor?.();
        } catch (e: any) {
            console.debug('[reportShareEcbt:editor-refresh]', e?.message || e);
        }
        showToast(t('report.share.imported') || 'Relatório importado', 'success');
        return true;
    } catch (err: any) {
        log.error('import report ecbt failed:', err?.message || err);
        showToast(t('report.share.importFailed') || 'Falha ao importar', 'error');
        return false;
    }
}

/** Importa .ecbt — pergunta origem (Library ecbyts | dispositivo local). */
export async function importReportEcbt(): Promise<void> {
    const lib: any = await import('./_ecbtLibraryStore.js' as string);
    const source = await lib.chooseEcbtTarget('import');
    if (!source) return;
    if (source === 'library') {
        const entry = await lib.pickFromEcbtLibrary('report');
        if (entry?.key) await importReportEcbtKey(entry.key);
        return;
    }
    _importFromFile();
}

/** Abre seletor de arquivo .ecbt e importa o relatório (origem: dispositivo local). */
export function importReportEcbtFromFile(): void {
    _importFromFile();
}

function _importFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ecbt,text/plain';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            await importReportEcbtKey(text);
        } catch (err: any) {
            log.error('read .ecbt file failed:', err?.message || err);
            showToast(t('report.share.importFailed') || 'Falha ao ler arquivo', 'error');
        } finally {
            input.remove();
        }
    });
    document.body.appendChild(input);
    input.click();
}

if (typeof window !== 'undefined') {
    (window as any).exportActiveReportEcbt = exportActiveReportEcbt;
    (window as any).importReportEcbt = importReportEcbt;
    (window as any).importReportEcbtFromFile = importReportEcbtFromFile;
    (window as any).importReportEcbtKey = importReportEcbtKey;
}
