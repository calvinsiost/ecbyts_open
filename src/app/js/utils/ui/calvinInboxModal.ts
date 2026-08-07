// @ts-check
// Generated from src/app/js/utils/ui/calvinInboxModal.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   CALVIN INBOX MODAL — SPEC_AGENT_CHANNEL_CALVIN_INBOX

   View "Inbox" Calvin-first do docs/AGENT_CHANNEL.md. Renderiza
   apenas as threads relevantes para decisão humana, agrupadas em
   3 colunas:
     - decide_now: needsCalvin OR status=blocked
     - watchlist:  roadmap P0/P1 não-resolved
     - resolved_recently: resolved nos últimos 7 dias

   Pure-logic vive em core/agentChannel/calvinInbox.js (reutiliza
   classifyThreadForInbox + countInboxStats + groupThreads do
   agentChannelReader). Esta UI cuida apenas de DOM + i18n.

   Source of truth permanece o markdown — modal é read-only.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { toFiniteNumber } from '../helpers/toFiniteNumber.js';
import { buildTimeline } from '../../core/session/agentChannelReader.js';
import {
    groupThreadsByInboxSection,
    countInboxStats,
    shouldCollapseDiagnostic,
} from '../../core/agentChannel/calvinInbox.js';
const MODAL_ID = 'calvin-inbox-modal';
const CHANNEL_URL = '/docs/AGENT_CHANNEL.md';
const LAST_VISIT_KEY = 'ecbyts-calvin-inbox-last-visit';
const MAX_BODY_PREVIEW = 320;
/**
 * @typedef {Object} InboxThread
 * @property {string} topic
 * @property {string} owner
 * @property {string} status
 * @property {boolean} needsCalvin
 * @property {string} roadmap_priority
 * @property {string} roadmap_item
 * @property {number} updatedAt
 * @property {string} bodyPreview
 * @property {string} lastTimestamp
 */
/** @type {{ threads: InboxThread[] | null, loading: boolean, error: string | null, lastVisitTs: number }} */
const _state: any = {
    threads: null,
    loading: false,
    error: null,
    lastVisitTs: 0,
};
/**
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function tx( key: any, fallback: any) {
    const value = t(key);
    return value && value !== key ? value : fallback;
}
/**
 * Truncate body preview.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function truncate( text: any, max: any) {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + '…';
}
/**
 * Adapt ChannelThread (from agentChannelReader) to InboxThread shape that
 * calvinInbox.js classification helpers expect. Extracts `Needs Calvin`,
 * `Priority`, `Roadmap` from message body using regex (tolerant — missing
 * fields just disable enrichment, per §6 spec).
 *
 * @param {ReturnType<typeof buildTimeline>['threads']} channelThreads
 * @returns {InboxThread[]}
 */
function adaptToInboxThreads( channelThreads: any) {
    return channelThreads.map((thread: any) => {
        const lastMsg = thread.messages[thread.messages.length - 1];
        const body = lastMsg ? lastMsg.body : '';
        const needsCalvin = /\bneeds?\s+calvin\s*[:=]\s*yes\b/i.test(body) || /@calvin\b/i.test(body);
        const priorityMatch = body.match(/\bpriority\s*[:=]\s*(P[0-2])\b/i);
        const roadmapMatch = body.match(/\broadmap\s*[:=]\s*([A-Z0-9-]+|none)\b/i);
        const status = mapStatusForInbox(thread.lastStatus);
        // Parse timestamp string to ms — fallback to 0 if unparseable.
        const ts = Date.parse(thread.lastTimestamp);
        return {
            topic: thread.topic,
            owner: thread.agents[0] || 'unknown',
            status,
            needsCalvin,
            roadmap_priority: priorityMatch && priorityMatch[1] ? priorityMatch[1].toUpperCase() : 'P2',
            roadmap_item: roadmapMatch && roadmapMatch[1] ? roadmapMatch[1] : '',
            updatedAt: toFiniteNumber(ts, 0),
            bodyPreview: truncate(body, MAX_BODY_PREVIEW),
            lastTimestamp: thread.lastTimestamp,
        };
    });
}
/**
 * Map agentChannelReader statuses to calvinInbox-friendly tokens.
 * @param {string} channelStatus
 * @returns {string}
 */
function mapStatusForInbox( channelStatus: any) {
    if (channelStatus === 'in-progress') return 'in_progress';
    return channelStatus;
}
function renderStats() {
    if (!_state.threads) return '';
    const stats = countInboxStats(_state.threads, _state.lastVisitTs, Date.now());
    const cards = [
        {
            label: tx('admin.calvinInbox.stats.needsCalvin', 'Needs Calvin'),
            value: stats.needsCalvin,
            cls: 'cinb-stat--needs',
        },
        {
            label: tx('admin.calvinInbox.stats.criticalPath', 'Critical path'),
            value: stats.criticalPath,
            cls: 'cinb-stat--critical',
        },
        {
            label: tx('admin.calvinInbox.stats.blockers', 'Blockers'),
            value: stats.blockers,
            cls: 'cinb-stat--blockers',
        },
        {
            label: tx('admin.calvinInbox.stats.changedSinceVisit', 'Changed since last visit'),
            value: stats.changedSinceVisit,
            cls: 'cinb-stat--changed',
        },
    ];
    return cards
        .map((c: any) =>
                `<div class="cinb-stat ${c.cls}"><span class="cinb-stat-label">${escapeHtml(c.label)}</span><span class="cinb-stat-value">${escapeHtml(String(c.value))}</span></div>`,
        )
        .join('');
}
/**
 * @param {InboxThread} thread
 * @returns {string}
 */
function renderCard( thread: any) {
    const ageMs = thread.updatedAt > 0 ? Date.now() - thread.updatedAt : null;
    const ageLabel = ageMs !== null ? formatAge(ageMs) : '';
    const priorityCls = `cinb-card-priority cinb-card-priority--${thread.roadmap_priority.toLowerCase()}`;
    const needsCalvinBadge = thread.needsCalvin
        ? `<span class="cinb-card-badge cinb-card-badge--needs">${escapeHtml(tx('admin.calvinInbox.badge.needsCalvin', 'Needs Calvin'))}</span>`
        : '';
    const roadmapLine = thread.roadmap_item
        ? `<span class="cinb-card-roadmap">${escapeHtml(thread.roadmap_item)}</span>`
        : '';
    return (
        '<article class="cinb-card">' +
        '<header class="cinb-card-head">' +
        `<span class="cinb-card-topic">${escapeHtml(thread.topic)}</span>` +
        `<span class="${priorityCls}">${escapeHtml(thread.roadmap_priority)}</span>` +
        '</header>' +
        '<div class="cinb-card-meta">' +
        `<span class="cinb-card-owner">${escapeHtml(thread.owner)}</span>` +
        roadmapLine +
        (ageLabel ? `<time class="cinb-card-age">${escapeHtml(ageLabel)}</time>` : '') +
        needsCalvinBadge +
        '</div>' +
        `<pre class="cinb-card-preview">${escapeHtml(thread.bodyPreview)}</pre>` +
        '</article>'
    );
}
/**
 * @param {number} ageMs
 * @returns {string}
 */
function formatAge( ageMs: any) {
    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    if (hours < 1) return tx('admin.calvinInbox.age.justNow', 'just now');
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}
function renderColumns() {
    if (_state.loading) {
        return `<div class="cinb-empty">${escapeHtml(tx('admin.calvinInbox.loading', 'Loading channel…'))}</div>`;
    }
    if (_state.error) {
        return `<div class="cinb-error">${escapeHtml(_state.error)}</div>`;
    }
    if (!_state.threads || _state.threads.length === 0) {
        return `<div class="cinb-empty">${escapeHtml(tx('admin.calvinInbox.empty', 'No active threads. The channel is healthy.'))}</div>`;
    }
    const grouped = groupThreadsByInboxSection(_state.threads, Date.now());
    const decideNow = grouped.decide_now || [];
    const watchlist = grouped.watchlist || [];
    const resolved = grouped.resolved_recently || [];
    const columns = [
        {
            title: tx('admin.calvinInbox.section.decideNow', 'Decide now'),
            cls: 'cinb-col--decide',
            items: decideNow,
            emptyText: tx('admin.calvinInbox.emptyDecide', 'No pending decisions.'),
        },
        {
            title: tx('admin.calvinInbox.section.watchlist', 'Watchlist'),
            cls: 'cinb-col--watch',
            items: watchlist,
            emptyText: tx('admin.calvinInbox.emptyWatch', 'Nothing on watchlist.'),
        },
        {
            title: tx('admin.calvinInbox.section.resolvedRecently', 'Resolved (7d)'),
            cls: 'cinb-col--resolved',
            items: resolved,
            emptyText: tx('admin.calvinInbox.emptyResolved', 'No recent closures.'),
        },
    ];
    return columns
        .map((col: any) => {
            const body =
                col.items.length === 0
                    ? `<div class="cinb-col-empty">${escapeHtml(col.emptyText)}</div>`
                    : col.items.map(renderCard).join('');
            return (
                `<section class="cinb-col ${col.cls}">` +
                `<header class="cinb-col-head"><h3>${escapeHtml(col.title)}</h3><span class="cinb-col-count">${col.items.length}</span></header>` +
                `<div class="cinb-col-body">${body}</div>` +
                '</section>'
            );
        })
        .join('');
}
function renderDiagnostic() {
    const stats = _state.threads ? countInboxStats(_state.threads, _state.lastVisitTs, Date.now()) : null;
    const collapsed = shouldCollapseDiagnostic(stats as any);
    const total = _state.threads ? _state.threads.length : 0;
    return (
        `<details class="cinb-diag" ${collapsed ? '' : 'open'}>` +
        `<summary>${escapeHtml(tx('admin.calvinInbox.diagnostic', 'Diagnostic'))}</summary>` +
        `<dl class="cinb-diag-list">` +
        `<dt>${escapeHtml(tx('admin.calvinInbox.diag.totalThreads', 'Total threads'))}</dt><dd>${total}</dd>` +
        `<dt>${escapeHtml(tx('admin.calvinInbox.diag.source', 'Source'))}</dt><dd><code>docs/AGENT_CHANNEL.md</code></dd>` +
        `</dl>` +
        '</details>'
    );
}
function renderInlineStyles() {
    return (
        '<style>' +
        '.cinb-modal { display:flex; flex-direction:column; gap:12px; max-height:80vh; }' +
        '.cinb-head { display:flex; justify-content:space-between; align-items:center; gap:12px; }' +
        '.cinb-head h2 { margin:0; font-size:18px; }' +
        '.cinb-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px; }' +
        '.cinb-stat { background:rgba(255,255,255,0.04); border:1px solid var(--border-color,#333); border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:2px; }' +
        '.cinb-stat-label { font-size:10px; color:var(--text-tertiary,#888); text-transform:uppercase; letter-spacing:0.04em; }' +
        '.cinb-stat-value { font-size:20px; font-weight:700; color:var(--text-primary,#fff); }' +
        '.cinb-stat--needs .cinb-stat-value { color:#fbbf24; }' +
        '.cinb-stat--critical .cinb-stat-value { color:#f97316; }' +
        '.cinb-stat--blockers .cinb-stat-value { color:#ef4444; }' +
        '.cinb-stat--changed .cinb-stat-value { color:#60a5fa; }' +
        '.cinb-cols { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; overflow-y:auto; max-height:55vh; padding-right:4px; }' +
        '.cinb-col { background:rgba(255,255,255,0.02); border:1px solid var(--border-color,#2a2a2a); border-radius:6px; padding:10px; min-height:140px; }' +
        '.cinb-col-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--border-color,#2a2a2a); }' +
        '.cinb-col-head h3 { margin:0; font-size:13px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary,#aaa); }' +
        '.cinb-col-count { font-size:11px; padding:1px 6px; border-radius:10px; background:rgba(255,255,255,0.06); color:var(--text-tertiary,#888); }' +
        '.cinb-col--decide { border-left:3px solid #fbbf24; }' +
        '.cinb-col--watch { border-left:3px solid #60a5fa; }' +
        '.cinb-col--resolved { border-left:3px solid #22c55e; }' +
        '.cinb-col-body { display:flex; flex-direction:column; gap:8px; }' +
        '.cinb-col-empty { font-size:11px; color:var(--text-tertiary,#888); text-align:center; padding:16px 4px; border:1px dashed var(--border-color,#444); border-radius:4px; }' +
        '.cinb-card { background:rgba(0,0,0,0.2); border:1px solid var(--border-color,#333); border-radius:5px; padding:8px 10px; }' +
        '.cinb-card-head { display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px; }' +
        '.cinb-card-topic { font-size:12px; font-weight:600; color:var(--text-primary,#fff); }' +
        '.cinb-card-priority { font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; background:rgba(255,255,255,0.06); }' +
        /* WCAG 1.4.3: #fff em #ef4444 media 3.76:1 e em #f97316 2.80:1 (badge
           10px precisa ≥4.5:1). Fundos nos tokens canônicos calibrados:
           --accent-red (#b91c1c) = 6.47:1, --accent-orange (#b45309) = 5.02:1. */
        '.cinb-card-priority--p0 { background:var(--accent-red,#b91c1c); color:#fff; }' +
        '.cinb-card-priority--p1 { background:var(--accent-orange,#b45309); color:#fff; }' +
        '.cinb-card-priority--p2 { background:#6b7280; color:#fff; }' +
        '.cinb-card-meta { display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-size:10px; color:var(--text-tertiary,#888); margin-bottom:4px; }' +
        '.cinb-card-owner { font-weight:600; color:var(--accent,#60a5fa); }' +
        '.cinb-card-roadmap { font-family:var(--font-mono, monospace); }' +
        '.cinb-card-badge { padding:1px 5px; border-radius:3px; font-weight:600; }' +
        '.cinb-card-badge--needs { background:#fbbf24; color:#000; }' +
        '.cinb-card-preview { white-space:pre-wrap; font-family:var(--font-mono, monospace); font-size:10px; color:var(--text-primary,#ccc); margin:0; max-height:80px; overflow:hidden; background:rgba(0,0,0,0.2); padding:4px 6px; border-radius:3px; }' +
        '.cinb-empty, .cinb-error { padding:20px; text-align:center; color:var(--text-tertiary,#888); border:1px dashed var(--border-color,#444); border-radius:6px; }' +
        '.cinb-error { color:#ef4444; border-color:#ef4444; }' +
        '.cinb-diag { margin-top:8px; font-size:12px; color:var(--text-secondary,#aaa); }' +
        '.cinb-diag summary { cursor:pointer; color:var(--text-tertiary,#888); }' +
        '.cinb-diag-list { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:8px 0 0 0; }' +
        '.cinb-diag-list dt { font-size:11px; color:var(--text-tertiary,#888); }' +
        '.cinb-diag-list dd { margin:0; font-size:11px; font-family:var(--font-mono, monospace); }' +
        '.cinb-actions { display:flex; gap:8px; align-items:center; }' +
        '@media (max-width:900px) { .cinb-cols { grid-template-columns:1fr; } }' +
        '</style>'
    );
}
function refreshContent() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const statsEl = modal.querySelector('.cinb-stats');
    if (statsEl) statsEl.innerHTML = renderStats();
    const colsEl = modal.querySelector('.cinb-cols');
    if (colsEl) colsEl.innerHTML = renderColumns();
    const diagEl = modal.querySelector('.cinb-diag-host');
    if (diagEl) diagEl.innerHTML = renderDiagnostic();
}
async function loadChannelText() {
    _state.loading = true;
    _state.error = null;
    refreshContent();
    try {
        const res = await fetch(CHANNEL_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const timeline = buildTimeline(text);
        _state.threads = adaptToInboxThreads(timeline.threads);
    } catch (err: any) {
        const msg = err && /** @type {any} */ (err).message ? /** @type {any} */ (err).message : String(err);
        _state.error = `${tx('admin.calvinInbox.loadError', 'Failed to load channel')}: ${msg}`;
        _state.threads = null;
    } finally {
        _state.loading = false;
        refreshContent();
    }
}
function loadLastVisitTs() {
    try {
        const raw = localStorage.getItem(LAST_VISIT_KEY);
        const n = raw ? Number(raw) : 0;
        _state.lastVisitTs = toFiniteNumber(n, 0);
    } catch {
        _state.lastVisitTs = 0;
    }
}
function persistLastVisitTs() {
    try {
        localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    } catch (e: any) {
        console.debug(
            '[calvinInbox:persist-visit]',
            e && /** @type {any} */ (e).message ? /** @type {any} */ (e).message : e,
        );
    }
}
/**
 * @param {HTMLElement} modal
 */
function attachHandlers( modal: any) {
    const closeBtn = modal.querySelector('.cinb-close');
    if (closeBtn) closeBtn.addEventListener('click', closeCalvinInboxModal);
    modal.addEventListener('click', (e: any) => {
        if (e.target === modal) closeCalvinInboxModal();
    });
    const reloadBtn = modal.querySelector('.cinb-reload');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            loadChannelText().then(() => {
                showToast(tx('admin.calvinInbox.reloaded', 'Inbox reloaded'), 'success');
            });
        });
    }
    document.addEventListener('keydown', escListener, { once: false });
}
/**
 * @param {KeyboardEvent} e
 */
function escListener( e: any) {
    if (e.key === 'Escape') {
        const modal = document.getElementById(MODAL_ID);
        if (modal && /** @type {HTMLElement} */ (modal).style.display !== 'none') {
            closeCalvinInboxModal();
        }
    }
}
export function openCalvinInboxModal() {
    loadLastVisitTs();
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'cinb-title');
        const title = escapeHtml(tx('admin.calvinInbox.title', 'Calvin Inbox'));
        const desc = escapeHtml(
            tx(
                'admin.calvinInbox.description',
                'Calvin-first read of docs/AGENT_CHANNEL.md. Threads grouped by what needs human decision now.',
            ),
        );
        const closeLabel = escapeHtml(tx('common.close', 'Close'));
        const reloadLabel = escapeHtml(tx('admin.calvinInbox.reload', 'Reload'));
        modal.innerHTML =
            renderInlineStyles() +
            '<div class="ecbt-dialog ecbt-dialog--lg cinb-modal" role="document">' +
            '<div class="cinb-head">' +
            `<h2 id="cinb-title">${title}</h2>` +
            '<div class="cinb-actions">' +
            `<button type="button" class="cinb-reload ecbt-btn ecbt-btn--ghost" style="padding:6px 12px;font-size:12px">${reloadLabel}</button>` +
            `<button type="button" class="cinb-close ecbt-btn" aria-label="${closeLabel}" style="padding:4px 10px">&times;</button>` +
            '</div>' +
            '</div>' +
            `<p style="margin:0;color:var(--text-tertiary,#888);font-size:12px">${desc}</p>` +
            '<div class="cinb-stats" aria-live="polite"></div>' +
            '<div class="cinb-cols" aria-live="polite"></div>' +
            '<div class="cinb-diag-host"></div>' +
            '</div>';
        document.body.appendChild(modal);
        attachHandlers(modal);
    }
    /** @type {HTMLElement} */ (modal).style.display = 'flex';
    refreshContent();
    if (!_state.threads && !_state.loading) {
        loadChannelText();
    }
    // Persist visit AFTER load so the next visit can detect changes since.
    persistLastVisitTs();
}
export function closeCalvinInboxModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
        /** @type {HTMLElement} */ (modal).style.display = 'none';
    }
    document.removeEventListener('keydown', escListener);
}
export default { openCalvinInboxModal, closeCalvinInboxModal };
