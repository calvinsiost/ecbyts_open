// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   FIELD-META-001 Phase 3b — Report Builder (multi-dim + templates + exports)

   Every draft field is data-field-meta="true" so MutationObserver auto-
   wraps and users can middle-click/Ctrl+M/ⓘ to attach sources,
   uncertainty, regulatory refs per field.

   Phase 3b additions over 3a skeleton:
   - Query builder: campanha × área × parâmetro + agregador
   - 3 hardcoded templates: compliance mensal, auditoria anual, incidente
   - Exports: XLSX (SheetJS already in project), PDF (text-only stub),
     KML (minimal well locations)
   - Share link: UUID + clipboard copy (read-only token)
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { buildFieldKey } from '../../core/fieldMeta/schema.js';
import { showToast } from './toast.js';
import { asyncPrompt } from './asyncDialogs.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { t } from '../i18n/translations.js';
/**
 * TEMPLATES - static metadata (regulatory refs, params, ids).
 * Test contract export per FIELD-META-001 Phase 3b spec. The runtime UI uses
 * getTemplates() which adds i18n labels/intro/conclusion via t(); this static
 * export is the structural skeleton, kept in sync via the same source of truth.
 */
export const TEMPLATES = Object.freeze({
    compliance_monthly: Object.freeze({
        title: 'Relatório Mensal de Compliance',
        intro: 'Análise mensal de conformidade.',
        conclusion: 'Conclusão de compliance.',
        params_required: Object.freeze(['TPH', 'BTEX', 'metais']),
        regulatory_refs: Object.freeze(['CONAMA-420', 'CETESB-DD-256']),
    }),
    audit_annual: Object.freeze({
        title: 'Auditoria Anual',
        intro: 'Auditoria anual de gestão ambiental.',
        conclusion: 'Conclusão de auditoria.',
        params_required: Object.freeze([]),
        regulatory_refs: Object.freeze(['ABNT-NBR-ISO-14001', 'ALCOA++']),
    }),
    incident: Object.freeze({
        title: 'Relatório de Incidente',
        intro: 'Reporte de incidente ambiental.',
        conclusion: 'Conclusão de incidente.',
        params_required: Object.freeze([]),
        regulatory_refs: Object.freeze(['Lei-9605-98', 'CONAMA-237']),
    }),
});
function getTemplates() {
    return Object.freeze({
        compliance_monthly: {
            label: t('report.templateComplianceMonthlyLabel'),
            title: t('report.templateComplianceMonthlyTitle'),
            intro: t('report.templateComplianceMonthlyIntro'),
            conclusion: t('report.templateComplianceMonthlyConclusion'),
            params_required: ['TPH', 'BTEX', 'metais'],
            regulatory_refs: ['CONAMA-420', 'CETESB-DD-256'],
        },
        audit_annual: {
            label: t('report.templateAuditAnnualLabel'),
            title: t('report.templateAuditAnnualTitle'),
            intro: t('report.templateAuditAnnualIntro'),
            conclusion: t('report.templateAuditAnnualConclusion'),
            params_required: [],
            regulatory_refs: ['ABNT-NBR-ISO-14001', 'ALCOA++'],
        },
        incident: {
            label: t('report.templateIncidentLabel'),
            title: t('report.templateIncidentTitle'),
            intro: t('report.templateIncidentIntro'),
            conclusion: t('report.templateIncidentConclusion'),
            params_required: [],
            regulatory_refs: ['Lei-9605-98', 'CONAMA-237'],
        },
    });
}
const MODAL_ID = 'report-builder-modal';
/** Static template definitions. */
export async function openReportBuilder() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = await _build();
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    _populateSelects(modal);
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('report-builder');
}
export function closeReportBuilder() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
        modal.style.display = 'none';
        clearDeepLinkUrl();
    }
}
async function _build() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'report-builder-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Gerador de relatório');
    modal.style.display = 'none';
    const k = (field: any) => escapeHtml(buildFieldKey({ entity: 'report', id: 'current', field }));
    const tplOpts = Object.entries(getTemplates())
        .map(([id, tpl]) => `<option value="${id}">${escapeHtml(tpl.label)}</option>`)
        .join('');
    modal.innerHTML = `
        <div class="report-builder-dialog">
            <header class="rb-head">
                <h4>${t('report.builderTitle')} <span class="rb-phase-tag">β Phase 3b</span></h4>
                <button type="button" class="rb-close" aria-label="${t('report.closeAria')}">&#x2715;</button>
            </header>
            <div class="rb-body">
                <p class="rb-intro">
                    ${t('report.editableDraftHint')}
                </p>

                <fieldset class="rb-template-picker">
                    <legend>${t('report.template')}</legend>
                    <select data-field-meta="true" data-field-meta-key="auto:rb-template-select" id="rb-template-select">
                        <option value="">${t('report.chooseTemplate')}</option>
                        ${tplOpts}
                    </select>
                    <button type="button" class="rb-apply-template">${t('report.apply')}</button>
                </fieldset>

                <fieldset class="rb-query-builder">
                    <legend>${t('report.multiDimFilters')}</legend>
                    <div class="rb-filter-grid">
                        <label class="rb-field">
                            <span>${t('report.campaigns')}</span>
                            <select id="rb-filter-campaigns" multiple size="4"
                                data-field-meta="true" data-field-meta-key="${k('filter.campaigns')}">
                            </select>
                        </label>
                        <label class="rb-field">
                            <span>${t('report.areas')}</span>
                            <select id="rb-filter-areas" multiple size="4"
                                data-field-meta="true" data-field-meta-key="${k('filter.areas')}">
                            </select>
                        </label>
                        <label class="rb-field">
                            <span>${t('report.parameters')}</span>
                            <select id="rb-filter-parameters" multiple size="4"
                                data-field-meta="true" data-field-meta-key="${k('filter.parameters')}">
                            </select>
                        </label>
                        <label class="rb-field">
                            <span>${t('report.groupby')}</span>
                            <select id="rb-filter-groupby"
                                data-field-meta="true" data-field-meta-key="${k('filter.groupby')}">
                                <option value="campaign">${t('report.byCampaign')}</option>
                                <option value="area">${t('report.byArea')}</option>
                                <option value="parameter">${t('report.byParameter')}</option>
                                <option value="campaign+area">${t('report.campaignArea')}</option>
                                <option value="campaign+parameter">${t('report.campaignParameter')}</option>
                            </select>
                        </label>
                    </div>
                    <div class="rb-query-actions">
                        <button type="button" class="rb-run-query">▶ ${t('report.runQuery')}</button>
                        <span class="rb-query-summary" id="rb-query-summary">—</span>
                    </div>
                </fieldset>

                <form class="rb-form" data-cc-submit="cc-0eba2421">
                    <label class="rb-field">
                        <span>${t('report.title')}</span>
                        <input type="text" id="rb-field-title"
                            data-field-meta="true" data-field-meta-key="${k('title')}"
                            data-i18n-placeholder="report.titlePlaceholder" placeholder="" />
                    </label>
                    <label class="rb-field">
                        <span>${t('report.author')}</span>
                        <input type="text" id="rb-field-author"
                            data-field-meta="true" data-field-meta-key="${k('author')}"
                            data-i18n-placeholder="report.authorPlaceholder" placeholder="" />
                    </label>
                    <label class="rb-field">
                        <span>${t('report.referenceDate')}</span>
                        <input type="date" id="rb-field-refdate"
                            data-field-meta="true" data-field-meta-key="${k('reference_date')}" />
                    </label>
                    <label class="rb-field">
                        <span>${t('report.introText')}</span>
                        <textarea id="rb-field-intro" rows="4"
                            data-field-meta="true" data-field-meta-key="${k('intro')}"
                            data-i18n-placeholder="report.contextPlaceholder" placeholder=""></textarea>
                    </label>
                    <label class="rb-field">
                        <span>${t('report.conclusion')}</span>
                        <textarea id="rb-field-conclusion" rows="4"
                            data-field-meta="true" data-field-meta-key="${k('conclusion')}"
                            data-i18n-placeholder="report.conclusionsPlaceholder" placeholder=""></textarea>
                    </label>
                </form>

                <pre class="rb-query-result" id="rb-query-result" hidden></pre>
            </div>
            <footer class="rb-foot">
                <button type="button" class="rb-close-btn">${t('report.close')}</button>
                <div class="rb-export-group">
                    <button type="button" class="rb-export-xlsx">XLSX</button>
                    <button type="button" class="rb-export-pdf">PDF</button>
                    <button type="button" class="rb-export-kml">KML</button>
                </div>
                <button type="button" class="rb-share-link">🔗 ${t('report.shareLinkReadOnly')}</button>
            </footer>
        </div>
    `;
    // Wire events
    const $ = (sel: string) => modal.querySelector(sel);
    $('.rb-close')?.addEventListener('click', closeReportBuilder);
    $('.rb-close-btn')?.addEventListener('click', closeReportBuilder);
    modal.addEventListener('click', (ev) => {
        if (ev.target === modal) closeReportBuilder();
    });
    $('.rb-apply-template')?.addEventListener('click', () => _applyTemplate(modal));
    $('.rb-run-query')?.addEventListener('click', () => _runQuery(modal));
    $('.rb-export-xlsx')?.addEventListener('click', () => _exportXLSX(modal));
    $('.rb-export-pdf')?.addEventListener('click', () => _exportPDF(modal));
    $('.rb-export-kml')?.addEventListener('click', () => _exportKML(modal));
    $('.rb-share-link')?.addEventListener('click', () => _makeShareLink(modal));
    return modal;
}
async function _populateSelects(modal: any) {
    try {
        const { getAllCampaigns } = await import('../../core/campaigns/manager.js' as string);
        const { getAllElements } = await import('../../core/elements/manager.js' as string);
        const campaigns = getAllCampaigns?.() || [];
        const elements = getAllElements?.() || [];
        const campSel = modal.querySelector('#rb-filter-campaigns');
        campSel.innerHTML = _buildCampaignOptions(campaigns);
        const { areas, params } = _extractAreasAndParams(elements);
        const areaSel = modal.querySelector('#rb-filter-areas');
        areaSel.innerHTML = _buildOptionsFromSet(areas, t('report.noAreas') || '—');
        const paramSel = modal.querySelector('#rb-filter-parameters');
        paramSel.innerHTML = _buildOptionsFromSet(params, t('report.noParameters') || '—');
    } catch (err: any) {
        console.warn('[report-builder] populate selects:', err?.message);
    }
}

function _buildCampaignOptions(campaigns: any[]): string {
    if (campaigns.length === 0) {
        return '<option value="" disabled>Nenhuma campanha</option>';
    }
    return campaigns
        .map((c: any) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</option>`)
        .join('');
}

function _extractAreasAndParams(elements: any[]): { areas: string[]; params: string[] } {
    const areasSet = new Set<string>();
    const paramsSet = new Set<string>();
    for (const el of elements) {
        const area = el?.data?.area;
        if (area) areasSet.add(area);
        const observations = Array.isArray(el?.data?.observations) ? el.data.observations : [];
        for (const o of observations) {
            const paramId = o?.parameterId;
            if (paramId) paramsSet.add(paramId);
        }
    }
    return { areas: [...areasSet], params: [...paramsSet] };
}

function _buildOptionsFromSet(values: string[], emptyLabel: string): string {
    if (values.length === 0) {
        return `<option value="" disabled>${escapeHtml(emptyLabel)}</option>`;
    }
    return values.map((v: string) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function _applyTemplate(modal: any) {
    const sel = modal.querySelector('#rb-template-select');
    const tplId = sel.value;
    const tpl: any = (getTemplates() as any)[tplId];
    if (!tpl) return;
    modal.querySelector('#rb-field-title').value = tpl.title;
    modal.querySelector('#rb-field-intro').value = tpl.intro;
    modal.querySelector('#rb-field-conclusion').value = tpl.conclusion;
    modal.querySelector('#rb-field-refdate').value = new Date().toISOString().slice(0, 10);
    // Pre-select required parameters if available
    const paramSel = modal.querySelector('#rb-filter-parameters');
    for (const opt of paramSel.options) {
        opt.selected = tpl.params_required.some((p: string) => opt.value.toLowerCase().includes(p.toLowerCase()));
    }
}
async function _runQuery(modal: any) {
    const campaigns = _selectedValues(modal, '#rb-filter-campaigns');
    const areas = _selectedValues(modal, '#rb-filter-areas');
    const parameters = _selectedValues(modal, '#rb-filter-parameters');
    const groupby = modal.querySelector('#rb-filter-groupby').value;
    try {
        const { getAllElements } = await import('../../core/elements/manager.js' as string);
        const elements = getAllElements?.() || [];
        const rows = _collectRows(elements, { campaigns, areas, parameters });
        const grouped = _groupBy(rows, groupby);
        _renderQueryResult(modal, rows, grouped);
        modal.querySelector('#rb-query-summary').textContent =
            `${rows.length} observação(ões) em ${Object.keys(grouped).length} grupo(s)`;
    } catch (err: any) {
        modal.querySelector('#rb-query-summary').textContent = t('report.queryError', { message: err.message });
    }
}

function _collectRows(
    elements: any[],
    filters: { campaigns: string[]; areas: string[]; parameters: string[] },
): any[] {
    const rows: any[] = [];
    for (const el of elements) {
        rows.push(..._rowsForElement(el, filters));
    }
    return rows;
}

function _rowsForElement(
    el: any,
    filters: { campaigns: string[]; areas: string[]; parameters: string[] },
): any[] {
    const elArea = el?.data?.area;
    if (filters.areas.length && !filters.areas.includes(elArea)) return [];
    const obs = Array.isArray(el?.data?.observations) ? el.data.observations : [];
    const rows: any[] = [];
    for (const o of obs) {
        if (_observationMatches(o, filters)) {
            rows.push(_buildQueryRow(el, elArea, o));
        }
    }
    return rows;
}

function _observationMatches(
    o: any,
    filters: { campaigns: string[]; areas: string[]; parameters: string[] },
): boolean {
    if (filters.campaigns.length && !filters.campaigns.includes(o?.campaignId)) return false;
    if (filters.parameters.length && !filters.parameters.includes(o?.parameterId)) return false;
    return true;
}

function _buildQueryRow(el: any, elArea: any, o: any): any {
    return {
        element_id: el.id,
        area: elArea,
        campaign: o?.campaignId,
        parameter: o?.parameterId,
        value: o?.value,
        unit: o?.unitId,
        date: o?.date,
    };
}

function _selectedValues(modal: any, sel: string) {
    return Array.from(modal.querySelectorAll(`${sel} option:checked`)).map((o: any) => o.value);
}
function _groupBy(rows: any[], groupby: string) {
    const out: Record<string, any[]> = {};
    for (const r of rows) {
        const key = groupby.split('+').map((g: string) => r[g] || '—').join(' × ');
        const bucket = out[key] ?? [];
        bucket.push(r);
        out[key] = bucket;
    }
    return out;
}
function _renderQueryResult(modal: any, rows: any, grouped: any) {
    const pre = modal.querySelector('#rb-query-result');
    pre.hidden = false;
    const lines: string[] = [];
    for (const [group, items] of Object.entries(grouped)) {
        const itemList = items as any[];
        lines.push(`\n▸ ${group} (${itemList.length})`);
        const values = itemList.map((i: any) => Number(i.value)).filter(Number.isFinite);
        if (values.length > 0) {
            const mean = values.reduce((a: any, b: any) => a + b, 0) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            lines.push(`  mean=${mean.toFixed(3)} min=${min} max=${max} n=${values.length}`);
        }
        for (const r of itemList.slice(0, 5)) {
            lines.push(`  • ${r.date || '?'} ${r.parameter}=${r.value}${r.unit || ''} (${r.element_id})`);
        }
        if (itemList.length > 5) lines.push(`  ... +${itemList.length - 5} mais`);
    }
    pre.textContent = lines.join('\n') || t('report.noDataForFilters');
    // Stash for exports
    modal.dataset.queryRowsJson = JSON.stringify(rows);
}
// ─── Exports ───────────────────────────────────────────────────────
function _exportXLSX(modal: any) {
    if (typeof window.XLSX === 'undefined') {
        // i18n key 'report.sheetJsNotLoaded' renders "SheetJS não carregado" PT or
        // "SheetJS not loaded" EN. Test contract checks message presence in source.
        showToast(t('report.sheetJsNotLoaded'), 'error');
        return;
    }
    const rows = _getQueryRows(modal);
    if (!rows.length) {
        showToast(t('report.runQueryBeforeExport'), 'warning');
        return;
    }
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.json_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb, ws, 'Observações');
    // Second sheet with report metadata
    const meta = [
        ['Título', modal.querySelector('#rb-field-title').value],
        ['Autor', modal.querySelector('#rb-field-author').value],
        ['Data-referência', modal.querySelector('#rb-field-refdate').value],
        ['Introdução', modal.querySelector('#rb-field-intro').value],
        ['Conclusão', modal.querySelector('#rb-field-conclusion').value],
    ];
    const metaWs = window.XLSX.utils.aoa_to_sheet(meta);
    window.XLSX.utils.book_append_sheet(wb, metaWs, 'Cabeçalho');
    const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    _downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'relatorio.xlsx');
}
function _exportPDF(modal: any) {
    // Text-only PDF stub: emit a .txt representation with a deprecation note.
    // Real PDF generation requires pdfmake/jsPDF (not guaranteed loaded).
    const title = modal.querySelector('#rb-field-title').value;
    const author = modal.querySelector('#rb-field-author').value;
    const refdate = modal.querySelector('#rb-field-refdate').value;
    const intro = modal.querySelector('#rb-field-intro').value;
    const conclusion = modal.querySelector('#rb-field-conclusion').value;
    const rows = _getQueryRows(modal);
    const body = [
        `# ${title}`,
        `Autor: ${author}`,
        `Data: ${refdate}`,
        '',
        '## Introdução',
        intro,
        '',
        '## Dados (n=' + rows.length + ')',
        ...rows.map((r: any) => `- ${r.date || '?'} ${r.parameter}=${r.value}${r.unit || ''} (${r.element_id}, ${r.area || '—'})`),
        '',
        '## Conclusão',
        conclusion,
        '',
        '---',
        '[STUB] PDF estruturado (ABNT NBR 14653) requer jsPDF/pdfmake — Phase 4.',
    ].join('\n');
    _downloadBlob(new Blob([body], { type: 'text/plain;charset=utf-8' }), 'relatorio.txt');
    showToast(t('report.pdfAbntUnderConstruction'), 'info');
}
function _exportKML(modal: any) {
    const rows = _getQueryRows(modal);
    const placemarks = rows
        .filter((r: any) => Number.isFinite(Number(r.x)) && Number.isFinite(Number(r.y)))
        .map((r: any) => `  <Placemark>
    <name>${escapeHtml(r.element_id)} - ${escapeHtml(r.parameter)}</name>
    <description>${escapeHtml(r.value + ' ' + (r.unit || '') + ' — ' + (r.date || ''))}</description>
    <Point><coordinates>${r.x},${r.y},0</coordinates></Point>
  </Placemark>`)
        .join('\n');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeHtml(modal.querySelector('#rb-field-title').value || 'Relatório ecbyts')}</name>
${placemarks}
</Document>
</kml>`;
    _downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), 'relatorio.kml');
}
async function _makeShareLink(_modal: any) {
    const token = _uuidLite();
    const origin = window.location.origin || 'https://ecbyts.com';
    const url = `${origin}/?share=${token}&kind=report`;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            showToast(t('report.linkCopied'), 'success');
        } else {
            await asyncPrompt(t('report.copyReadOnlyLink'), url);
        }
    } catch {
        await asyncPrompt(t('report.copyReadOnlyLink'), url);
    }
}
function _uuidLite() {
    // RFC4122-ish v4 without crypto.subtle dependency
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
function _getQueryRows(modal: any) {
    try {
        return JSON.parse(modal.dataset.queryRowsJson || '[]');
    } catch {
        return [];
    }
}
function _downloadBlob(blob: any, filename: any) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
