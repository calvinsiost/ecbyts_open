// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SQL TABLE BLOCK — Static SQL tables for reports
   Bloco de tabela SQL — snapshot estatico de queries SQL em relatorios

   Executa queries SQL via DataStudio engine e renderiza como tabela
   HTML estatica para insercao em relatorios. v1 = snapshot, sem refresh.
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
// Logger and toast are lazy-loaded to avoid pulling config.js/DOM at import time.
// Permite importar as funcoes puras (render, pivot, serialize) em Node sem browser.
/** @type {any} */
let _log: any = null;
async function _getLog() {
    if (!_log) {
        const { createLogger } = await import('../helpers/logger.js' as string);
        _log = createLogger('SQLTableBlock');
    }
    return _log;
}
/** @param {string} msg @param {string} type */
async function _toast(msg: any, type: any) {
    try {
        const { showToast } = await import('../ui/toast.js' as string);
        showToast(msg, type);
    }
    catch (e: any) {
        console.debug('[sqlTableBlock] toast:', e?.message || e);
        /* Node environment — no toast */
    }
}
// ----------------------------------------------------------------
// SQL EXECUTION FOR REPORTS
// Executa query SQL e retorna resultado estruturado
// ----------------------------------------------------------------
/**
 * Execute a SQL query against the DataStudio engine for report embedding.
 * Delega ao sqlEngine existente e retorna resultado normalizado.
 *
 * @param {string} query - SQL query string
 * @param {Object} [options] - Options
 * @param {number} [options.maxRows=500] - Maximum rows to include
 * @returns {Promise<{columns: string[], rows: any[][], executedAt: string, query: string}>}
 */
export async function executeSQLForReport(query: any, options: any = {}) {
    const maxRows = options.maxRows ?? 500;
    const { initSqlEngine, loadCurrentModelData, exec } = await import('../datastudio/sqlEngine.js' as string);
    await initSqlEngine();
    await loadCurrentModelData();
    const rawResults = exec(query);
    if (!rawResults || rawResults.length === 0) {
        return { columns: [], rows: [], executedAt: new Date().toISOString(), query };
    }
    const first = rawResults[0];
    const columns = first.columns || [];
    const rows = (first.values || []).slice(0, maxRows);
    return { columns, rows, executedAt: new Date().toISOString(), query };
}
// ----------------------------------------------------------------
// TABLE RENDERING
// Renderiza resultado SQL como tabela HTML
// ----------------------------------------------------------------
/**
 * Render a SQL result as an HTML table string for report embedding.
 * Todas as celulas sao escapadas para prevenir XSS.
 *
 * @param {{columns: string[], rows: any[][], executedAt: string, query: string}} result
 * @param {Object} [options] - Rendering options
 * @param {string} [options.caption] - Optional table caption
 * @param {string} [options.className] - CSS class for the table
 * @returns {string} HTML table string
 */
export function renderSQLTable(result: any, options: any = {}) {
    if (!result || !result.columns || result.columns.length === 0) {
        return '<p class="sql-table-empty"><em>No results</em></p>';
    }
    const cls = options.className || 'sql-table-report';
    const parts = [];
    parts.push(`<table class="${escapeHtml(cls)}" data-sql-block="true" data-executed-at="${escapeHtml(result.executedAt)}">`);
    if (options.caption) {
        parts.push(`<caption>${escapeHtml(options.caption)}</caption>`);
    }
    // Header row
    parts.push('<thead><tr>');
    for (const col of result.columns) {
        parts.push(`<th>${escapeHtml(String(col))}</th>`);
    }
    parts.push('</tr></thead>');
    // Body rows
    parts.push('<tbody>');
    for (const row of result.rows) {
        parts.push('<tr>');
        for (const cell of row) {
            const val = cell === null || cell === undefined ? '' : String(cell);
            parts.push(`<td>${escapeHtml(val)}</td>`);
        }
        parts.push('</tr>');
    }
    parts.push('</tbody>');
    parts.push('</table>');
    return parts.join('');
}
// ----------------------------------------------------------------
// GAC PIVOT TABLE
// Tabela pivotada para GAC: locais x campanhas x valores
// ----------------------------------------------------------------
/**
 * Build a GAC pivot table: locations as rows, campaigns as columns, values in cells.
 * Constroi tabela pivotada para Gerenciamento de Areas Contaminadas.
 *
 * @param {any[]} elements - Elements array from getAllElements()
 * @param {string} parameterId - Parameter to pivot on (e.g. 'benzene', 'pH')
 * @param {any[]} campaigns - Campaigns array from getAllCampaigns()
 * @returns {{columns: string[], rows: any[][], executedAt: string, query: string}}
 */
export function buildGACPivotTable(elements: any, parameterId: any, campaigns: any = []) {
    if (!Array.isArray(elements) || !parameterId) {
        return {
            columns: [],
            rows: [],
            executedAt: new Date().toISOString(),
            query: `GAC pivot: ${parameterId || 'none'}`,
        };
    }
    // Sort campaigns by start date for column ordering
    const sortedCampaigns = [...campaigns].sort((a: any, b: any) => (a.startDate || '').localeCompare(b.startDate || ''));
    const campaignNames = sortedCampaigns.map((c: any) => c.name || c.id);
    const columns = ['Location', ...campaignNames, 'Unit'];
    const rows = [];
    for (const el of elements) {
        if (!Array.isArray(el.observations) || el.observations.length === 0)
            continue;
        const name = el.name || el.id;
        const row = [name];
        for (const campaign of sortedCampaigns) {
            const value = _findObservationValue(el.observations, parameterId, campaign);
            row.push(value);
        }
        // Unit from first matching observation
        const unitObs = el.observations.find((o: any) => _matchesParameter(o, parameterId));
        row.push(unitObs?.unit || '');
        // Only add row if it has at least one non-null value
        const hasData = row.slice(1, -1).some((v: any) => v !== null);
        if (hasData)
            rows.push(row);
    }
    return {
        columns,
        rows,
        executedAt: new Date().toISOString(),
        query: `GAC pivot: ${parameterId}`,
    };
}
/**
 * Find observation value matching a parameter within a campaign date range.
 * @private
 * @param {any[]} observations
 * @param {string} parameterId
 * @param {any} campaign
 */
function _findObservationValue(observations: any, parameterId: any, campaign: any) {
    for (const obs of observations) {
        if (!_matchesParameter(obs, parameterId))
            continue;
        if (!_inCampaignRange(obs.date, campaign))
            continue;
        return obs.reading ?? null;
    }
    return null;
}
/**
 * Check if observation parameter matches the target.
 * @private
 * @param {any} obs
 * @param {string} parameterId
 */
function _matchesParameter(obs: any, parameterId: any) {
    if (!obs)
        return false;
    // Match by explicit parameter field or qualFields
    if (obs.parameter === parameterId)
        return true;
    if (Array.isArray(obs.qualFields)) {
        return obs.qualFields.some((qf: any) => qf.parameter === parameterId || qf.id === parameterId);
    }
    return false;
}
/**
 * Check if a date falls within a campaign date range.
 * @private
 * @param {string} dateStr
 * @param {any} campaign
 */
function _inCampaignRange(dateStr: any, campaign: any) {
    if (!dateStr || !campaign)
        return false;
    const d = dateStr.slice(0, 10);
    if (campaign.startDate && d < campaign.startDate)
        return false;
    if (campaign.endDate && d > campaign.endDate)
        return false;
    return true;
}
// ----------------------------------------------------------------
// SERIALIZATION
// Salva/carrega blocos SQL no conteudo do relatorio
// ----------------------------------------------------------------
/**
 * Serialize a SQL result block for persistence in report content.
 * Gera JSON serializavel para armazenar no conteudo do relatorio.
 *
 * @param {{columns: string[], rows: any[][], executedAt: string, query: string}} result
 * @returns {string} JSON string
 */
export function serializeSQLBlock(result: any) {
    return JSON.stringify({
        type: 'sql-table',
        version: 1,
        columns: result.columns,
        rows: result.rows,
        executedAt: result.executedAt,
        query: result.query,
    });
}
/**
 * Deserialize a SQL block from JSON string.
 * Restaura bloco SQL a partir de JSON armazenado.
 *
 * @param {string} json - JSON string from serializeSQLBlock
 * @returns {{columns: string[], rows: any[][], executedAt: string, query: string}|null}
 */
export function deserializeSQLBlock(json: any) {
    try {
        const obj = typeof json === 'string' ? JSON.parse(json) : json;
        if (obj?.type !== 'sql-table')
            return null;
        return {
            columns: Array.isArray(obj.columns) ? obj.columns : [],
            rows: Array.isArray(obj.rows) ? obj.rows : [],
            executedAt: obj.executedAt || '',
            query: obj.query || '',
        };
    }
    catch (e: any) {
        console.debug('[sqlTableBlock] parseObj:', e?.message || e);
        return null;
    }
}
// ----------------------------------------------------------------
// HANDLERS
// Funcoes para insercao de tabelas SQL em relatorios
// ----------------------------------------------------------------
/**
 * Execute SQL query and insert rendered table into the active report.
 * Handler principal para inserir tabela SQL no relatorio ativo.
 *
 * @param {string} reportId - Target report ID (or null for active)
 * @param {string} query - SQL query to execute
 * @returns {Promise<boolean>} true if inserted successfully
 */
export async function handleInsertSQLTable(reportId: any, query: any) {
    if (!query || typeof query !== 'string') {
        await _toast('SQL query is required', 'error');
        return false;
    }
    try {
        const result = await executeSQLForReport(query);
        const html = renderSQLTable(result, { caption: query });
        const serialized = serializeSQLBlock(result);
        // Wrap table with metadata div for round-trip serialization
        const block = `<div class="sql-table-block" data-sql-meta='${escapeHtml(serialized)}'>${html}</div>`;
        const { getReportById, getActiveReportId, setReportContent } = await import('./manager.js' as string);
        const targetId = reportId || getActiveReportId();
        const report = getReportById(targetId);
        if (!report) {
            await _toast('Report not found', 'error');
            return false;
        }
        setReportContent(report.content + block);
        const log = await _getLog();
        log.info(`SQL table inserted (${result.rows.length} rows)`);
        await _toast(`Table inserted (${result.rows.length} rows)`, 'success');
        return true;
    }
    catch (err: any) {
        const log = await _getLog();
        log.error('Failed to insert SQL table:', err);
        await _toast(`SQL error: ${err.message}`, 'error');
        return false;
    }
}
/**
 * Build GAC pivot table and insert into the active report.
 * Handler para inserir tabela pivotada GAC no relatorio.
 *
 * @param {string} reportId - Target report ID (or null for active)
 * @param {string} parameterId - Parameter to pivot
 * @returns {Promise<boolean>} true if inserted successfully
 */
export async function handleInsertGACPivot(reportId: any, parameterId: any) {
    if (!parameterId) {
        await _toast('Parameter ID is required', 'error');
        return false;
    }
    try {
        const { getAllElements } = await import('../../core/elements/manager.js' as string);
        const { getAllCampaigns } = await import('../../core/campaigns/manager.js' as string);
        const elements = getAllElements();
        const campaigns = getAllCampaigns();
        const result = buildGACPivotTable(elements, parameterId, campaigns);
        if (result.rows.length === 0) {
            await _toast('No data found for this parameter', 'warning');
            return false;
        }
        const html = renderSQLTable(result, {
            caption: `GAC Pivot: ${parameterId}`,
            className: 'sql-table-report gac-pivot',
        });
        const serialized = serializeSQLBlock(result);
        const block = `<div class="sql-table-block gac-pivot-block" data-sql-meta='${escapeHtml(serialized)}'>${html}</div>`;
        const { getReportById, getActiveReportId, setReportContent } = await import('./manager.js' as string);
        const targetId = reportId || getActiveReportId();
        const report = getReportById(targetId);
        if (!report) {
            await _toast('Report not found', 'error');
            return false;
        }
        setReportContent(report.content + block);
        const log = await _getLog();
        log.info(`GAC pivot inserted (${result.rows.length} locations)`);
        await _toast(`GAC pivot inserted (${result.rows.length} locations)`, 'success');
        return true;
    }
    catch (err: any) {
        const log = await _getLog();
        log.error('Failed to insert GAC pivot:', err);
        await _toast(`Pivot error: ${err.message}`, 'error');
        return false;
    }
}
