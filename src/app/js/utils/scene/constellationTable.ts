// @ts-check
// Generated from src/app/js/utils/scene/constellationTable.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   CONSTELLATION TABLE — PDPL-U / PDPLU tabular view of observations
   ================================================================

   Visualizacao tabular de observacoes no formato PDPL-U / PDPLU:
   P = Ponto (elemento monitorado)
   D = Data (data da medicao)
   P = Parametro (parametro medido)
   L = Leitura (valor numerico)
   U = Unidade (unidade de medida)

   Mostra observacoes do elemento selecionado no HUD constellation.
   Inclui botao de exportacao CSV no formato PDPL-U / PDPLU limpo.
   ================================================================ */
import { CONFIG } from '../../config.js';
import { hydrateIcons } from '../ui/icons.js';
import { scheduleResizeSync } from './setup.js';
import {
    getFieldsForElement,
    getObservationFieldsForElement,
    getTaxonomyFieldValue,
    getObservationTaxonomyValue,
} from '../../core/taxonomy/fieldResolver.js';
import { t } from '../i18n/translations.js';
// --- Module state ---
let activeTab = 'graph';
// Restaurar tab salva do localStorage
try {
    const saved = localStorage.getItem('ecbyts-constellation-tab') || '';
    if (saved && ['graph', 'pdplu', 'report', 'storyboard', 'inspector', 'preset', 'action-plan'].includes(saved)) {
        activeTab = saved;
    }
} catch (e: any) {
    console.debug('[constellationTable] loadTab:', e?.message || e);
}
// ================================================================
// TAB SWITCHING
// ================================================================
/**
 * Return active constellation tab id.
 * @returns {'graph'|'pdplu'}
 */
export function getActiveConstellationTab() {
    return /** @type {'graph'|'pdplu'} */ activeTab;
}
/**
 * Switch between graph, pdplu, report, and storyboard views.
 * Alterna entre a visualizacao de grafo, tabela PDPL-U / PDPLU, relatorio e storyboard.
 * @param {'graph'|'pdplu'|'report'|'storyboard'} tabId
 * @param {{ persist?: boolean }} [options]
 */
export function switchConstellationTab(tabId: any, options: any = {}) {
    // INSPECTOR-CONSTELLATION-TAB (Calvin 2026-06-03): 'inspector' precisa estar
    // nesta lista, senão o return precoce mata o show/hide das views — a aba
    // carregava o renderer dentro de um container que continuava display:none
    // (botão "morto"). As 5 views existem em index.html: graph/pdplu/report/
    // storyboard/inspector.
    // ACTION-PLAN-001 (FASE 2): 'action-plan' registrado aqui (validTabs) + no
    // restore de localStorage acima — a view #constellation-view-action-plan
    // existe em index.html (senão botão "morto"). Lazy-render em constellation.ts.
    const validTabs = ['graph', 'pdplu', 'report', 'storyboard', 'inspector', 'preset', 'action-plan'];
    if (!validTabs.includes(tabId)) return;
    activeTab = tabId;
    const persist = options?.persist !== false;
    if (persist) {
        try {
            localStorage.setItem('ecbyts-constellation-tab', tabId);
        } catch (e: any) {
            console.debug('[constellationTable] saveTab:', e?.message || e);
        }
    }
    // Hide all views, show active
    for (const id of validTabs) {
        const view = document.getElementById(`constellation-view-${id}`);
        if (view) view.style.display = id === tabId ? 'block' : 'none';
    }
    // Expande painel via custom property quando Report ativo (editor precisa de mais espaco)
    // Se colapsado, nao alterar a altura - manter 24px definido pelo toggleConstellationCollapse
    const isCollapsed = document.getElementById('constellation-hud')?.classList.contains('constellation-collapsed');
    if (!isCollapsed) {
        const mainArea = document.getElementById('main-area');
        if (mainArea) {
            if (tabId === 'report') {
                const expandedH = Math.min(Math.round(window.innerHeight * 0.45), 400);
                mainArea.style.setProperty('--bottom-panel-height', expandedH + 'px');
            } else {
                // Restaurar altura salva ou default
                const savedH = localStorage.getItem('ecbyts-constellation-height') || '';
                const h = savedH ? parseInt(savedH, 10) : 120;
                if (!isNaN(h)) mainArea.style.setProperty('--bottom-panel-height', h + 'px');
            }
        }
    }
    // Toggle active class + ARIA on tab buttons
    const tabs = document.querySelectorAll('.constellation-tab[data-ctab]');
    tabs.forEach((btn: any) => {
        const isActive = btn.dataset.ctab === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    scheduleResizeSync(
        document.getElementById('canvas-container'),
        undefined,
        document.getElementById('constellation-hud'),
    );
    if (typeof window.syncConstellationLayout === 'function') {
        requestAnimationFrame(() => window.syncConstellationLayout(tabId === 'graph'));
        requestAnimationFrame(() => requestAnimationFrame(() => window.syncConstellationLayout?.(tabId === 'graph')));
    }
}
// ================================================================
// PDPL-U / PDPLU TABLE RENDERING
// ================================================================
/**
 * Resolve parameter id to human name.
 * @param {string} parameterId
 * @returns {string}
 */
function resolveParamName(parameterId: any) {
    if (!parameterId) return '\u2014';
    const param = (CONFIG.PARAMETERS || []).find((p: any) => p.id === parameterId);
    return param ? param.name : parameterId;
}
/**
 * Resolve unit id to display label.
 * @param {string} unitId
 * @returns {string}
 */
function resolveUnitLabel(unitId: any) {
    if (!unitId) return '';
    const unit = (CONFIG.UNITS || []).find((u: any) => u.id === unitId);
    return unit ? unit.symbol || unit.name : unitId;
}
/**
 * Build flat PDPL-U / PDPLU rows from element observations.
 * Inclui leituras adicionais (additionalReadings) como linhas extras.
 * @param {any} element
 * @returns {Array<{ponto:string, data:string, parametro:string, leitura:*, unidade:string, obs:Object}>}
 */
function buildPDPLURows(element: any) {
    const rows: any = [];
    if (!element) return rows;
    const observations = element.data?.observations || [];
    const elementName = /** @type {any} */ element.name || /** @type {any} */ element.id || '\u2014';
    for (const obs of observations) {
        // Primary reading
        rows.push({
            ponto: elementName,
            data: obs.date || '\u2014',
            parametro: resolveParamName(obs.parameterId),
            leitura: obs.value != null ? obs.value : '\u2014',
            unidade: resolveUnitLabel(obs.unitId),
            obs,
        }) as any;
        // Additional readings at same point/date
        if (obs.additionalReadings) {
            for (const reading of obs.additionalReadings) {
                rows.push({
                    ponto: elementName,
                    data: obs.date || '\u2014',
                    parametro: resolveParamName(reading.parameterId),
                    leitura: reading.value != null ? reading.value : '\u2014',
                    unidade: resolveUnitLabel(reading.unitId),
                    obs,
                });
            }
        }
    }
    return rows;
}
/**
 * Collect taxonomy column definitions for element-level and observation-level fields.
 * Retorna colunas de taxonomia ativas para o elemento.
 *
 * @param {Object|null} element
 * @returns {{ elCols: Array<{taxId:string, fieldId:string, header:string}>, obsCols: Array<{taxId:string, fieldId:string, header:string}> }}
 */
function collectTaxonomyCols(element: any) {
    const elCols: any[] = [];
    const obsCols: any[] = [];
    if (!element) return { elCols, obsCols };
    // Element-level taxonomy fields (static per element - same value every row)
    const elFields = /** @type {Array<{ taxonomyId:string, field: any }>} */ getFieldsForElement(element);
    const seenEl = new Set();
    for (const entry of elFields) {
        const key = `${entry.taxonomyId}:${entry.field.id}`;
        if (seenEl.has(key)) continue;
        seenEl.add(key);
        elCols.push({
            taxId: entry.taxonomyId,
            fieldId: entry.field.id,
            header: entry.field.nameKey || entry.field.id,
        });
    }
    // Observation-level taxonomy fields (per-observation row)
    const obsFields = /** @type {Array<{ taxonomyId:string, field: any }>} */ getObservationFieldsForElement(element);
    const seenObs = new Set();
    for (const entry of obsFields) {
        const key = `${entry.taxonomyId}:${entry.field.id}`;
        if (seenObs.has(key)) continue;
        seenObs.add(key);
        obsCols.push({
            taxId: entry.taxonomyId,
            fieldId: entry.field.id,
            header: entry.field.nameKey || entry.field.id,
        });
    }
    return { elCols, obsCols };
}
/** Escape HTML special chars
 * @param {any} str
 */
function esc(str: any) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/**
 * Render the PDPL-U / PDPLU table for the given element.
 * Renderiza a tabela PDPL-U / PDPLU com colunas de taxonomia ativa.
 * @param {any} element
 */
export function updatePDPLUTable(element: any) {
    const container = document.getElementById('pdplu-table-container');
    if (!container) return;
    const rows = buildPDPLURows(element);
    const count = rows.length;
    if (count === 0) {
        container.innerHTML = `
            <div class="pdplu-toolbar">
                <span class="pdplu-toolbar-info">${t('constellation.readings.zero') || '0 readings'}</span>
                <button type="button" class="pdplu-export-btn" disabled>
                    <span data-icon="download" data-icon-size="12px"></span>
                    ${t('constellation.exportCSV') || 'Export CSV'}
                </button>
            </div>
            <table class="pdplu-table"><tbody>
                <tr><td class="pdplu-empty" colspan="5" data-i18n="constellation.noData">${t('constellation.noData') || 'Select an element with observations'}</td></tr>
            </tbody></table>`;
        hydrateIcons(container);
        return;
    }
    // Taxonomy columns: element-level (static) + observation-level (per row)
    const { elCols, obsCols } = collectTaxonomyCols(element);
    // eslint-disable-next-line
    const totalCols = 5 + elCols.length + obsCols.length;
    container.innerHTML = `
        <div class="pdplu-toolbar">
            <span class="pdplu-toolbar-info">${count === 0 ? t('constellation.readings.zero') || '0 readings' : count === 1 ? t('constellation.readings.one') || '1 reading' : (t('constellation.readings.other') || '{count} readings').replace('{count}', String(count))}</span>
            <button type="button" class="pdplu-export-btn"
                    data-cc-action="cc-cf7de35b">
                <span data-icon="download" data-icon-size="12px"></span>
                ${t('constellation.exportCSV') || 'Export CSV'}
            </button>
        </div>
        <table class="pdplu-table">
            <thead>
                <tr>
                    <th>Ponto</th>
                    <th>Data</th>
                    <th>Parâmetro</th>
                    <th class="pdplu-value">Leitura</th>
                    <th>Unidade</th>
                    ${elCols.map((c: any) => `<th class="pdplu-var" data-i18n="${esc(c.header)}">${esc(c.header)}</th>`).join('')}
                    ${obsCols.map((c: any) => `<th class="pdplu-var" data-i18n="${esc(c.header)}">${esc(c.header)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${rows
                    .map(
                        (r: any) => `
                    <tr>
                        <td>${esc(r.ponto)}</td>
                        <td>${esc(r.data)}</td>
                        <td>${esc(r.parametro)}</td>
                        <td class="pdplu-value">${esc(String(r.leitura))}</td>
                        <td>${esc(r.unidade)}</td>
                        ${elCols.map((c: any) => `<td class="pdplu-var">${esc(String(getTaxonomyFieldValue(/** @type {any} */ element, c.taxId, c.fieldId) ?? ''))}</td>`).join('')}
                        ${obsCols.map((c: any) => `<td class="pdplu-var">${esc(String(getObservationTaxonomyValue(r.obs, c.taxId, c.fieldId) ?? ''))}</td>`).join('')}
                    </tr>
                `,
                    )
                    .join('')}
            </tbody>
        </table>`;
    hydrateIcons(container);
}
// ================================================================
// CSV EXPORT
// ================================================================
/** Escape a CSV field — wrap in quotes if contains separator, quotes, or newlines
 * @param {any} val
 * @param {string} sep
 */
function csvEscape(val: any, sep: any) {
    const s = String(val ?? '');
    if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}
/**
 * Export PDPL-U / PDPLU table data as CSV and trigger download.
 * Exporta dados PDPL-U / PDPLU com taxonomia como CSV com BOM para Excel.
 * @param {any} element
 */
export function exportPDPLUCSV(element: any) {
    const rows = buildPDPLURows(element);
    if (rows.length === 0) return;
    const { elCols, obsCols } = collectTaxonomyCols(element);
    const sep = ',';
    const headers = [
        'Ponto',
        'Data',
        'Parametro',
        'Leitura',
        'Unidade',
        ...elCols.map((c: any) => c.header),
        ...obsCols.map((c: any) => c.header),
    ];
    const lines = [headers.join(sep)];
    for (const r of rows) {
        const base = [
            csvEscape(r.ponto, sep),
            csvEscape(r.data, sep),
            csvEscape(r.parametro, sep),
            r.leitura != null && r.leitura !== '\u2014' ? r.leitura : '',
            csvEscape(r.unidade, sep),
        ];
        // Element-level taxonomy fields (same for all rows)
        for (const c of elCols) {
            base.push(csvEscape(getTaxonomyFieldValue(/** @type {any} */ element, c.taxId, c.fieldId) ?? '', sep));
        }
        // Observation-level taxonomy fields (per observation)
        for (const c of obsCols) {
            base.push(csvEscape(getObservationTaxonomyValue(r.obs, c.taxId, c.fieldId) ?? '', sep));
        }
        lines.push(base.join(sep));
    }
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const _el = element as any;
    const name = (_el?.name || 'data').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `pdplu-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
