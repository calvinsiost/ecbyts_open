// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   RADAR AUDIT LOG VIEWER — modal with filters + live facade refresh.
   Phase 5 / 5 of SPEC_DATASTUDIO_RADAR_PROFILES §8.4.

   Loads last 200 events from `radar_audit_log` for a slice, supports
   filters (grantee, profile, endpoint, event, date range), CSV export
   (LGPD compliance), inline row expansion (request/response JSON), and
   a Live toggle that refreshes through the Supabase api facade.

   Pure helpers exported for testing:
     - formatEventTimestamp(ts)
     - summarizeRequestMeta(metadata)
     - filterEvents(events, filters)
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
import { showToast } from '../toast.js';
import { exportCsv } from '../../helpers/csvExport.js';
import * as sessionModule from '../../auth/session.js';
import {
    formatEventTimestamp as _formatEventTimestamp,
    summarizeRequestMeta as _summarizeRequestMeta,
    filterEvents as _filterEvents,
} from './_pureHelpers.js';
export { formatEventTimestamp, summarizeRequestMeta, filterEvents } from './_pureHelpers.js';
const MODAL_ID = 'radar-audit-modal';
const INITIAL_LIMIT = 200;
const MAX_LIVE_ROWS = 500;
const LIVE_POLL_MS = 10_000;
let _sliceId: any = null;
let _projectId: any = null;
let _sliceName = '';
let _events: any[] = [];
let _filters = freshFilters();
let _live = false;
let _liveTimer: ReturnType<typeof setInterval> | null = null;
const _expanded = new Set();
// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------
/** @returns {Filters} */
function freshFilters() {
    return { grantee: '', profile: '', endpoint: '', event: '', dateFrom: '', dateTo: '' };
}
/** @param {unknown} e */
function errorMessage(e: any) {
    return e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
}
/** @param {string} key @param {string} fallback */
function tr(key: any, fallback: any) {
    return t(key) || fallback;
}
function getSupabaseClient() {
    return sessionModule.getSupabaseClient?.() ?? null;
}
async function loadEvents() {
    const client = getSupabaseClient();
    if (!client) {
        showToast(tr('audit.errNoSupabase', 'Supabase não disponível'), 'warning');
        _events = [];
        return;
    }
    if (!_sliceId) {
        _events = [];
        return;
    }
    try {
        const res = await client
            .schema('api')
            .from('radar_audit_log')
            .select('id,grant_id,slice_id,event,endpoint,request_metadata,response_summary,user_id,created_at')
            .eq('slice_id', _sliceId)
            .order('created_at', { ascending: false })
            .limit(INITIAL_LIMIT);
        _events = res && Array.isArray(res.data) ? res.data : [];
    } catch (e: any) {
        showToast(`Audit: ${errorMessage(e)}`, 'error');
        _events = [];
    }
}
function startLive() {
    const client = getSupabaseClient();
    if (!client || !_sliceId) {
        showToast(tr('audit.errLiveUnavail', 'Realtime indisponível'), 'warning');
        _live = false;
        syncLiveToggle();
        return;
    }
    stopLive();
    const refresh = async () => {
        try {
            await loadEvents();
            if (_events.length > MAX_LIVE_ROWS) _events.length = MAX_LIVE_ROWS;
            refreshTable();
        } catch (e: any) {
            console.debug('[radarAudit] live refresh error:', errorMessage(e));
        }
    };
    void refresh();
    _liveTimer = setInterval(() => {
        void refresh();
    }, LIVE_POLL_MS);
}
function stopLive() {
    if (_liveTimer) {
        clearInterval(_liveTimer);
    }
    _liveTimer = null;
}
function syncLiveToggle() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const btn = (modal.querySelector('.ral-live-btn')) as HTMLButtonElement|null;
    if (!btn) return;
    btn.classList.toggle('ral-live--on', _live);
    btn.textContent = _live ? `● ${tr('audit.liveOn', 'Live ON')}` : `○ ${tr('audit.liveOff', 'Live OFF')}`;
}
// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------
function renderHeader() {
    const title = escapeHtml(tr('audit.title', 'Audit Log'));
    const sliceLabel = _sliceName ? `: ${escapeHtml(_sliceName)}` : '';
    return (
        '<div class="ral-header">' +
        `<h2 style="margin:0">${title}${sliceLabel}</h2>` +
        '<button class="ecbt-btn ral-close-x" aria-label="close" style="padding:4px 10px">&times;</button>' +
        '</div>'
    );
}
function renderFilters() {
    const grantee = escapeHtml(tr('audit.fGrantee', 'Email do grantee'));
    const profile = escapeHtml(tr('audit.fProfile', 'Perfil (slug)'));
    const endpoint = escapeHtml(tr('audit.fEndpoint', 'Endpoint'));
    const event = escapeHtml(tr('audit.fEvent', 'Evento'));
    const from = escapeHtml(tr('audit.fFrom', 'De'));
    const to = escapeHtml(tr('audit.fTo', 'Até'));
    return (
        '<div class="ral-filters">' +
        `<input type="text" class="ral-input ral-f-grantee" placeholder="${grantee}" value="${escapeHtml(_filters.grantee)}">` +
        `<input type="text" class="ral-input ral-f-profile" placeholder="${profile}" value="${escapeHtml(_filters.profile)}">` +
        `<input type="text" class="ral-input ral-f-endpoint" placeholder="${endpoint}" value="${escapeHtml(_filters.endpoint)}">` +
        `<input type="text" class="ral-input ral-f-event" placeholder="${event}" value="${escapeHtml(_filters.event)}">` +
        `<input type="date" class="ral-input ral-f-from" title="${from}" value="${escapeHtml(_filters.dateFrom)}">` +
        `<input type="date" class="ral-input ral-f-to" title="${to}" value="${escapeHtml(_filters.dateTo)}">` +
        '</div>'
    );
}
/** @param {AuditEvent} ev */
function renderRow(ev: any) {
    const ts = escapeHtml(_formatEventTimestamp(ev.created_at));
    const event = escapeHtml(ev.event || '');
    const endpoint = escapeHtml(ev.endpoint || '-');
    const grantee = escapeHtml(ev.grantee_email || '-');
    const meta = escapeHtml(_summarizeRequestMeta(ev.request_metadata));
    const expanded = _expanded.has(ev.id);
    let detail = '';
    if (expanded) {
        let reqJson: string;
        let resJson: string;
        try {
            reqJson = JSON.stringify(ev.request_metadata || {}, null, 2);
        } catch (_err: any) {
            reqJson = '<unserializable>';
        }
        try {
            resJson = JSON.stringify(ev.response_summary || {}, null, 2);
        } catch (_err: any) {
            resJson = '<unserializable>';
        }
        detail =
            '<tr class="ral-detail"><td colspan="6">' +
            '<div class="ral-detail-grid">' +
            `<div><strong>request_metadata</strong><pre>${escapeHtml(reqJson)}</pre></div>` +
            `<div><strong>response_summary</strong><pre>${escapeHtml(resJson)}</pre></div>` +
            '</div></td></tr>';
    }
    const caret = expanded ? '▼' : '▶';
    return (
        `<tr class="ral-row" data-event-id="${escapeHtml(ev.id)}">` +
        `<td><button class="ral-expand-btn" data-event-id="${escapeHtml(ev.id)}">${caret}</button></td>` +
        `<td><code style="font-size:10px">${ts}</code></td>` +
        `<td><span class="ral-event-tag">${event}</span></td>` +
        `<td><code>${endpoint}</code></td>` +
        `<td>${grantee}</td>` +
        `<td><code style="font-size:10px">${meta}</code></td>` +
        '</tr>' +
        detail
    );
}
function renderTable() {
    const filtered = _filterEvents(_events, _filters);
    if (filtered.length === 0) {
        return `<div class="ral-empty">${escapeHtml(tr('audit.noEvents', 'Nenhum evento encontrado.'))}</div>`;
    }
    const rows = filtered.map(renderRow).join('');
    const total = filtered.length;
    const totalLabel = escapeHtml(tr('audit.total', 'eventos'));
    return (
        `<div class="ral-count">${total} ${totalLabel}</div>` +
        '<div class="ral-table-wrap">' +
        '<table class="ral-table">' +
        '<thead><tr>' +
        '<th style="width:24px"></th>' +
        `<th>${escapeHtml(tr('audit.timestamp', 'Timestamp'))}</th>` +
        `<th>${escapeHtml(tr('audit.event', 'Evento'))}</th>` +
        `<th>${escapeHtml(tr('audit.endpoint', 'Endpoint'))}</th>` +
        `<th>${escapeHtml(tr('audit.grantee', 'Grantee'))}</th>` +
        `<th>${escapeHtml(tr('audit.meta', 'Request meta'))}</th>` +
        '</tr></thead>' +
        `<tbody>${rows}</tbody></table></div>`
    );
}
function renderActions() {
    return (
        '<div class="ral-actions">' +
        `<button class="ecbt-btn ral-export">${escapeHtml(tr('audit.exportCsv', 'Exportar CSV'))}</button>` +
        `<button class="ecbt-btn ral-live-btn">○ ${escapeHtml(tr('audit.liveOff', 'Live OFF'))}</button>` +
        '</div>'
    );
}
function refreshTable() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const tableWrap = modal.querySelector('.ral-table-section');
    if (tableWrap) tableWrap.innerHTML = renderTable();
    attachRowHandlers();
}
function readFiltersFromDOM() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    /** @param {string} opts */
    const v = (sel: any) => modal.querySelector(sel)?.value ?? '';
    _filters = {
        grantee: v('.ral-f-grantee'),
        profile: v('.ral-f-profile'),
        endpoint: v('.ral-f-endpoint'),
        event: v('.ral-f-event'),
        dateFrom: v('.ral-f-from'),
        dateTo: v('.ral-f-to'),
    };
}
function attachRowHandlers() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.querySelectorAll('.ral-expand-btn').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-event-id');
            if (!id) return;
            if (_expanded.has(id)) _expanded.delete(id);
            else _expanded.add(id);
            refreshTable();
        });
    });
}
function attachHandlers() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const x = modal.querySelector('.ral-close-x');
    if (x) x.addEventListener('click', closeAuditLogViewer);
    ['.ral-f-grantee', '.ral-f-profile', '.ral-f-endpoint', '.ral-f-event', '.ral-f-from', '.ral-f-to'].forEach((sel: any) => {
            const el = modal.querySelector(sel);
            if (el) {
                el.addEventListener('input', () => {
                    readFiltersFromDOM();
                    refreshTable();
                });
                el.addEventListener('change', () => {
                    readFiltersFromDOM();
                    refreshTable();
                });
            }
        },
    );
    const exportBtn = modal.querySelector('.ral-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const filtered = _filterEvents(_events, _filters);
            try {
                const headers = [
                    'id',
                    'created_at',
                    'event',
                    'endpoint',
                    'grantee_email',
                    'profile_slug',
                    'request_metadata',
                    'response_summary',
                    'grant_id',
                    'slice_id',
                    'user_id',
                ];
                const rows = filtered.map((e: any) => [
                    e.id,
                    e.created_at,
                    e.event,
                    e.endpoint,
                    e.grantee_email,
                    e.profile_slug,
                    e.request_metadata,
                    e.response_summary,
                    e.grant_id,
                    e.slice_id,
                    e.user_id,
                ]);
                exportCsv(headers, rows, `radar-audit-${_sliceId || 'slice'}-${Date.now()}`);
                showToast(tr('audit.exported', 'CSV exportado'), 'success');
            } catch (e: any) {
                showToast(`Export: ${errorMessage(e)}`, 'error');
            }
        });
    }
    const liveBtn = modal.querySelector('.ral-live-btn');
    if (liveBtn) {
        liveBtn.addEventListener('click', () => {
            _live = !_live;
            syncLiveToggle();
            if (_live) startLive();
            else stopLive();
        });
    }
    attachRowHandlers();
    syncLiveToggle();
}
// eventsToCSV removed 2026-05-27 — replaced by canonical helpers/csvExport.exportCsv
// (drops ~40L of duplicated escape logic; behavior preserved with RFC 4180 + UTF-8 BOM).
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Open the audit log viewer modal for a given slice.
 *
 * @param {{ sliceId: string, projectId: string, sliceName?: string }} opts
 * @returns {Promise<void>}
 */
export async function openAuditLogViewer(opts: any) {
    if (!opts || !opts.sliceId || !opts.projectId) {
        showToast(tr('audit.errMissingIds', 'sliceId/projectId ausentes'), 'error');
        return;
    }
    _sliceId = opts.sliceId;
    _projectId = opts.projectId;
    _sliceName = opts.sliceName || '';
    _filters = freshFilters();
    _expanded.clear();
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML =
            '<div class="ecbt-dialog ecbt-dialog--xl" style="max-width:1080px">' +
            '<div class="ral-shell">' +
            renderHeader() +
            '<div class="ral-filters-section"></div>' +
            '<div class="ral-actions-section"></div>' +
            '<div class="ral-table-section"></div>' +
            '</div>' +
            '<style>' +
            '.ral-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }' +
            '.ral-filters { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin-bottom:8px; }' +
            '.ral-input { padding:6px 8px; border-radius:4px; background:var(--bg-primary,#121220); border:1px solid var(--border-color,#444); color:var(--text-primary,#fff); font-size:11px; box-sizing:border-box; }' +
            '.ral-input:focus { outline:1px solid var(--accent,#60a5fa); }' +
            '.ral-actions { display:flex; gap:8px; margin-bottom:8px; }' +
            '.ral-count { font-size:11px; color:var(--text-tertiary,#888); margin-bottom:6px; }' +
            '.ral-table-wrap { max-height:55vh; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:6px; }' +
            '.ral-table { width:100%; border-collapse:collapse; font-size:11px; }' +
            '.ral-table th { position:sticky; top:0; background:var(--bg-secondary,#1a1a2a); padding:6px 8px; text-align:left; font-size:10px; text-transform:uppercase; color:var(--text-tertiary,#888); z-index:1; }' +
            '.ral-table td { padding:5px 8px; border-bottom:1px solid rgba(255,255,255,0.05); vertical-align:top; }' +
            '.ral-row:hover { background:rgba(255,255,255,0.03); cursor:pointer; }' +
            '.ral-expand-btn { background:transparent; border:none; color:var(--text-tertiary,#888); cursor:pointer; font-size:10px; padding:2px 4px; }' +
            '.ral-expand-btn:hover { color:var(--text-primary,#fff); }' +
            '.ral-event-tag { display:inline-block; padding:1px 6px; border-radius:3px; font-size:10px; background:rgba(96,165,250,0.18); color:#60a5fa; font-weight:600; }' +
            '.ral-detail { background:rgba(0,0,0,0.2); }' +
            '.ral-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:8px; }' +
            '.ral-detail-grid pre { background:var(--bg-primary,#121220); padding:8px; border-radius:4px; font-size:10px; color:var(--text-primary,#fff); margin:4px 0 0; max-height:240px; overflow:auto; }' +
            '.ral-live-btn.ral-live--on { background:#22c55e; color:#000; }' +
            '.ral-empty { padding:14px; text-align:center; color:var(--text-tertiary,#888); border:1px dashed rgba(255,255,255,0.1); border-radius:6px; font-size:12px; margin-top:8px; }' +
            '</style>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAuditLogViewer();
        });
    } else {
        const shell = modal.querySelector('.ral-shell');
        if (shell) {
            const headerEl = shell.querySelector('.ral-header');
            if (headerEl) headerEl.outerHTML = renderHeader();
        }
    }
    /** @type {HTMLElement} */ (modal).style.display = 'flex';
    await loadEvents();
    const fSection = modal.querySelector('.ral-filters-section');
    const aSection = modal.querySelector('.ral-actions-section');
    const tSection = modal.querySelector('.ral-table-section');
    if (fSection) fSection.innerHTML = renderFilters();
    if (aSection) aSection.innerHTML = renderActions();
    if (tSection) tSection.innerHTML = renderTable();
    attachHandlers();
}
export function closeAuditLogViewer() {
    stopLive();
    const modal = document.getElementById(MODAL_ID);
    if (modal) /** @type {HTMLElement} */ (modal).style.display = 'none';
    _sliceId = null;
    _projectId = null;
    _sliceName = '';
    _events = [];
    _filters = freshFilters();
    _live = false;
    _expanded.clear();
}
export function _resetForTests() {
    stopLive();
    _sliceId = null;
    _projectId = null;
    _sliceName = '';
    _events = [];
    _filters = freshFilters();
    _live = false;
    _expanded.clear();
}
