// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   HEALTH-MON-001 Phase 4 — Health Export Handlers
   Expõe (window as any).handleExportWorkersCSV e (window as any).handleExportReadingsCSV

   Usa exportEngine.js (lógica pura) + Blob/anchor para download.
   Sem dependências de DOM além do momento do download.
   ================================================================ */
import { exportWorkersCSV, exportReadingsCSV } from '../../core/health/exportEngine.js';
import { listWorkers } from '../../core/health/workerRegistry.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('HealthExport');
// Importação dinâmica do biomarkerReading para evitar ciclo se necessário
/**
 * @param {string} projectId
 * @returns {Promise<any[]>}
 */
async function _listReadings(projectId: any) {
    try {
        const mod = (await import('../../core/health/biomarkerReading.js' as string));
        const fn = mod.listReadings;
        return typeof fn === 'function' ? fn(projectId) : [];
    }
    catch {
        return [];
    }
}
/**
 * Triggers download of a CSV string as a file in the browser.
 * Usa Blob + anchor programático (padrão sem servidor).
 *
 * @param {string} csvString - conteúdo do arquivo CSV
 * @param {string} filename - nome do arquivo para download
 */
function _downloadCSV(csvString: any, filename: any) {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
/**
 * Derive projectId from the currently active health panel or fallback to 'default'.
 * @returns {string}
 */
function _getActiveProjectId() {
    // Tenta ler do painel de saúde se estiver aberto
    const panelEl = document.getElementById('health-panel');
    if (panelEl) {
        const pid = panelEl.getAttribute('data-project-id');
        if (pid)
            return pid;
    }
    return 'default';
}
// ----------------------------------------------------------------
// Public handlers (exportados como objeto para registro em index.js)
// ----------------------------------------------------------------
/**
 * Export workers as anonymized CSV and trigger browser download.
 * (window as any).handleExportWorkersCSV()
 */
async function handleExportWorkersCSV() {
    try {
        const projectId = _getActiveProjectId();
        const workers = listWorkers(projectId);
        const csv = exportWorkersCSV(workers);
        const filename = `ecbt-workers-${projectId}-${new Date().toISOString().slice(0, 10)}.csv`;
        _downloadCSV(csv, filename);
        showToast(`Workers exportados: ${workers.length} registros (CSV anonimizado LGPD)`, 'success');
        log.info('handleExportWorkersCSV', { count: workers.length, projectId });
    }
    catch (err: any) {
        log.error('handleExportWorkersCSV failed', err);
        showToast('Erro ao exportar workers CSV', 'error');
    }
}
/**
 * Export biomarker readings as CSV and trigger browser download.
 * (window as any).handleExportReadingsCSV()
 */
async function handleExportReadingsCSV() {
    try {
        const projectId = _getActiveProjectId();
        const readings = await _listReadings(projectId);
        const csv = exportReadingsCSV(readings);
        const filename = `ecbt-readings-${projectId}-${new Date().toISOString().slice(0, 10)}.csv`;
        _downloadCSV(csv, filename);
        showToast(`Leituras exportadas: ${readings.length} registros (CSV)`, 'success');
        log.info('handleExportReadingsCSV', { count: readings.length, projectId });
    }
    catch (err: any) {
        log.error('handleExportReadingsCSV failed', err);
        showToast('Erro ao exportar leituras CSV', 'error');
    }
}
/**
 * Combined export: triggers download of both workers and readings CSV files.
 * Used by the Dashboard tab "Export CSV" button.
 * (window as any).handleExportHealthCsv()
 */
async function handleExportHealthCsv() {
    await handleExportWorkersCSV();
    await handleExportReadingsCSV();
}
export const healthExportHandlers = {
    handleExportWorkersCSV,
    handleExportReadingsCSV,
    handleExportHealthCsv,
};
