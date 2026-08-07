// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   HEALTH-ALERTS WIDGET — Floating panel for aggregated health alerts

   Consome readings persistidas via core/health/healthStore.js e
   aplica core/health/healthAlertEvaluator.evaluateAll para classificar
   por severidade (emergency > critical > warning > ok). Clique em
   uma row tenta abrir o elemento associado no inspector.

   Public API:
     openHealthAlertsWidget()          - abre modal (auto-refresh 30s)
     closeHealthAlertsWidget()         - fecha modal (preserva interval)
     computeHealthAlertsSummary(readings) - PURE helper (testável)

   Padrão visual: .ecbt-overlay + .ecbt-dialog--md (design tokens).
   Dependências resolvidas via dynamic import para boot leve.
   Lógica pura em computeHealthAlertsSummary — sem DOM, sem rede.
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { evaluateAll } from '../../core/health/healthAlertEvaluator.js';
import { attachModalA11y } from './modalA11y.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
const MODAL_ID = 'health-alerts-widget';
const AUTO_REFRESH_MS = 30_000;
/** @type {number|null} */
let _refreshTimer: any = null;
/** @type {(() => void)|null} */
let _a11yCleanup: any = null;
/** Severity rank for sorting (higher = more urgent). */
const SEVERITY_RANK = Object.freeze({
    expired: 5,
    emergency: 4,
    critical: 3,
    warning: 2,
    ok: 1,
});
/** Severity → icon + tone classes. */
const SEVERITY_META = Object.freeze({
    expired: { icon: '&#9760;', tone: 'expired', i18nKey: 'healthAlertSeverityExpired' },
    emergency: { icon: '&#9888;', tone: 'emergency', i18nKey: 'healthAlertSeverityEmergency' },
    critical: { icon: '&#9888;', tone: 'critical', i18nKey: 'healthAlertSeverityCritical' },
    warning: { icon: '&#9888;', tone: 'warning', i18nKey: 'healthAlertSeverityWarning' },
    ok: { icon: '&#10003;', tone: 'ok', i18nKey: 'healthAlertSeverityOk' },
});
// ----------------------------------------------------------------
// PURE HELPER — testável sem DOM
// ----------------------------------------------------------------
/**
 * @typedef {Object} HealthAlertItem
 * @property {string} id
 * @property {string} severity
 * @property {string} kind
 * @property {string} label
 * @property {string=} workerPseudonym
 * @property {string=} elementId
 */
/**
 * @typedef {Object} HealthAlertsSummary
 * @property {number} total
 * @property {{emergency:number, critical:number, warning:number, ok:number, expired:number}} bySeverity
 * @property {HealthAlertItem[]} items
 */
/**
 * Compute aggregated health alerts summary from a readings array.
 * Pure function — no DOM, no IO. Safe to call from tests.
 *
 * @param {unknown} readings Array de readings (ignora valores inválidos)
 * @returns {HealthAlertsSummary}
 */
export function computeHealthAlertsSummary(readings: any) {
    const empty = {
        total: 0,
        bySeverity: { emergency: 0, critical: 0, warning: 0, ok: 0, expired: 0 },
        items: [],
    };
    if (!Array.isArray(readings) || readings.length === 0)
        return empty;
    const items = [];
    const bySeverity = { emergency: 0, critical: 0, warning: 0, ok: 0, expired: 0 };
    for (const r of readings) {
        if (!r || typeof r !== 'object')
            continue;
        let result;
        try {
            result = evaluateAll(r);
        }
        catch (err: any) {
            console.debug('[health-alerts:evaluate]', err?.message || err);
            continue;
        }
        if (!result || typeof result !== 'object')
            continue;
        const severity = result.severity;
        if (typeof severity !== 'string')
            continue;
        // Determine evaluator kind for label/i18n routing
        const reading = r;
        const bt = typeof reading.biomarkerType === 'string' ? reading.biomarkerType : '';
        const confKind = reading.confounders && typeof reading.confounders === 'object' && reading.confounders !== null
            ? reading.confounders.kind
            : null;
        let kind = 'unknown';
        if (/^nr\d+_.*_days_left$/.test(bt))
            kind = 'nr_expiry';
        else if (confKind === 'cumulative_exposure')
            kind = 'cumulative_exposure';
        else if (confKind === 'vaccination')
            kind = 'vaccination';
        else if (confKind === 'psychosocial')
            kind = 'psychosocial';
        const label: any = typeof (result as any).label === "string" ? (result as any).label : "";
        const item: any = {
            id: typeof reading.id === 'string' ? reading.id : `alert-${items.length}`,
            kind,
            label,
            ...result,
            severity,
        };
        if (typeof reading.workerPseudonym === 'string')
            item.workerPseudonym = reading.workerPseudonym;
        if (typeof reading.elementId === 'string')
            item.elementId = reading.elementId;
        items.push(item);
        if (severity in bySeverity) {
            (bySeverity as any)[severity]++;
        }
    }
    // Sort: more severe first (rank desc); tie-breaker: original order (stable sort)
    items.sort((a: any, b: any) => {
        const ra = (SEVERITY_RANK as Record<string,any>)[a.severity] || 0;
        const rb = (SEVERITY_RANK as Record<string,any>)[b.severity] || 0;
        return rb - ra;
    });
    return { total: items.length, bySeverity, items };
}
// ----------------------------------------------------------------
// DOM HELPERS (browser-only)
// ----------------------------------------------------------------
/**
 * Resolve t() lazily so tests can import this module in Node.
 * Falls back to identity if i18n is unavailable.
 * @param {string} key
 * @returns {string}
 */
function _t(key: any) {
    try {
        const w = globalThis.window;
        if (w && typeof w.__t === 'function')
            return w.__t(key);
    }
    catch (err: any) {
        console.debug('[health-alerts:t]', err?.message || err);
    }
    return key;
}
/** @returns {Promise<any[]>} */
async function _loadReadings() {
    try {
        const mod = await import('../../core/health/healthStore.js' as string);
        if (typeof mod.loadReadings === 'function') {
            const list = await mod.loadReadings();
            return Array.isArray(list) ? list : [];
        }
    }
    catch (err: any) {
        console.debug('[health-alerts:loadReadings]', err?.message || err);
    }
    return [];
}
/**
 * Render the modal skeleton (idempotent).
 * @returns {HTMLElement}
 */
function _buildModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal)
        return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ecbt-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Health Alerts');
    modal.style.display = 'none';
    const closeLabel = escapeHtml(_t('close') || 'Close');
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--md" data-testid="health-alerts-dialog">
            <div class="ecbt-header">
                <span class="ecbt-title">
                    <span aria-hidden="true">&#127973;</span>
                    ${escapeHtml(_t('healthAlertsWidgetTitle') || 'Alertas de Saúde')}
                    <span id="health-alerts-total" style="margin-left:8px; padding:2px 8px; border-radius:10px; background:var(--bg-tertiary,#2a2a3a); font-size:12px; font-weight:600;">0</span>
                </span>
                <button type="button" class="ecbt-close" aria-label="${closeLabel}" data-action="close">&#x2715;</button>
            </div>
            <div id="health-alerts-body" style="padding:16px 20px; max-height:60vh; overflow-y:auto;"></div>
        </div>
    `;
    modal.addEventListener('click', (ev) => {
        const target = ev.target;
        if (target === modal) {
            closeHealthAlertsWidget();
            return;
        }
        if ((target as any).dataset && (target as any).dataset.action === 'close') {
            closeHealthAlertsWidget();
            return;
        }
        // "Send to scene" button — converts alert into a `post` placa
        const sendBtn = (target as any).closest && (target as any).closest('[data-action="send-to-scene"]');
        if (sendBtn) {
            ev.stopPropagation();
            _sendAlertToScene(sendBtn);
            return;
        }
        const row = (target as any).closest && (target as any).closest('[data-element-id]');
        if (row) {
            const elementId = row.dataset && row.dataset.elementId;
            if (elementId)
                _selectElement(elementId);
        }
    });
    document.body.appendChild(modal);
    return modal;
}
/** @param {string} elementId */
function _selectElement(elementId: any) {
    try {
        const w = globalThis.window;
        if (w && typeof w.handleSelectElement === 'function') {
            w.handleSelectElement(elementId);
        }
    }
    catch (err: any) {
        console.debug('[health-alerts:selectElement]', err?.message || err);
    }
}
/**
 * Render summary into the body container.
 * @param {HealthAlertsSummary} summary
 */
function _renderSummary(summary: any) {
    const body = document.getElementById('health-alerts-body');
    const totalBadge = document.getElementById('health-alerts-total');
    if (!body)
        return;
    if (totalBadge)
        totalBadge.textContent = String(summary.total);
    if (summary.total === 0) {
        body.innerHTML = `
            <div style="text-align:center; padding:32px 16px; color:var(--text-secondary,#888);">
                <div style="font-size:32px; margin-bottom:8px;" aria-hidden="true">&#10003;</div>
                <div>${escapeHtml(_t('healthAlertsEmptyState') || 'Nenhum alerta — todos os indicadores dentro dos parâmetros')}</div>
            </div>
        `;
        return;
    }
    // Group by severity for sections
    const groups = { expired: [], emergency: [], critical: [], warning: [], ok: [] };
    for (const it of summary.items) {
        if (it.severity in groups)
            (groups as any)[it.severity].push(it);
    }
    const sectionOrder = ['expired', 'emergency', 'critical', 'warning', 'ok'];
    const sections = sectionOrder
        .filter((sev: any) => (groups as any)[sev].length > 0)
        .map((sev: any) => {
        const meta = (SEVERITY_META as Record<string,any>)[sev];
        const sevLabel = escapeHtml(_t(meta.i18nKey) || sev);
        const count = (groups as any)[sev].length;
        const rows = (groups as any)[sev].map((it: any) => _renderRow(it, meta)).join('');
        return `
                <section class="health-alerts-section" data-severity="${escapeHtml(sev)}" style="margin-bottom:12px;">
                    <header style="display:flex; justify-content:space-between; align-items:center; padding:6px 4px; border-bottom:1px solid var(--border-color,#333); margin-bottom:6px;">
                        <span style="font-weight:600; font-size:13px;">
                            <span aria-hidden="true">${meta.icon}</span> ${sevLabel}
                        </span>
                        <span style="font-size:12px; color:var(--text-secondary,#888);">${count}</span>
                    </header>
                    <div>${rows}</div>
                </section>
            `;
    })
        .join('');
    body.innerHTML = sections;
}
/**
 * @param {HealthAlertItem} item
 * @param {{icon:string, tone:string, i18nKey:string}} meta
 * @returns {string}
 */
function _renderRow(item: any, meta: any) {
    const label = escapeHtml(item.label || item.kind || '');
    const elementAttr = item.elementId ? `data-element-id="${escapeHtml(item.elementId)}"` : '';
    const clickable = item.elementId ? 'cursor:pointer;' : '';
    const alertJson = escapeHtml(JSON.stringify(item));
    const sendLabel = escapeHtml(_t('healthAlertSendToScene') || 'Adicionar placa no modelo');
    const sendBtn = `
        <button type="button"
                class="health-alert-send"
                data-action="send-to-scene"
                data-alert-json="${alertJson}"
                title="${sendLabel}"
                aria-label="${sendLabel}"
                style="border:none; background:transparent; cursor:pointer; padding:4px 6px; border-radius:4px; font-size:14px; color:var(--text-secondary,#888);"
                data-cc-mouseover="cc-71fdea55"
                data-cc-mouseout="cc-00823db3">
            <span aria-hidden="true">&#128204;</span>
        </button>
    `;
    return `
        <div class="health-alert-row" ${elementAttr}
             style="display:flex; gap:8px; align-items:center; padding:8px 6px; border-radius:6px; ${clickable}"
             data-cc-mouseover="cc-f68cda7f"
             data-cc-mouseout="cc-00823db3">
            <span aria-hidden="true" style="font-size:14px; min-width:18px;">${meta.icon}</span>
            <span style="flex:1; font-size:13px;">${label}</span>
            ${sendBtn}
        </div>
    `;
}
/**
 * Convert a clicked alert row into a `post` element. Reads the alert
 * JSON from the data attribute and delegates to the handler.
 * @param {HTMLElement} btn
 * @returns {void}
 */
function _sendAlertToScene(btn: any) {
    if (!btn || !btn.dataset || !btn.dataset.alertJson)
        return;
    let alertItem;
    try {
        alertItem = JSON.parse(btn.dataset.alertJson);
    }
    catch (err: any) {
        console.debug('[health-alerts:parseAlert]', err?.message || err);
        return;
    }
    // Lazy import — keeps boot path light
    import('../handlers/postFromHealthAlert.js' as string)
        .then((mod) => {
        if (mod && typeof mod.handleCreatePostFromHealthAlert === 'function') {
            mod.handleCreatePostFromHealthAlert({
                alertItem,
                linkedElementId: alertItem.elementId || null,
            });
        }
    })
        .catch((err) => console.debug('[health-alerts:sendToScene]', err?.message || err));
}
// ----------------------------------------------------------------
// Public lifecycle
// ----------------------------------------------------------------
/**
 * Open the floating widget and refresh data. Starts auto-refresh interval.
 * @returns {Promise<void>}
 */
export async function openHealthAlertsWidget() {
    const modal = _buildModal();
    modal.style.display = 'flex';
    _a11yCleanup = attachModalA11y(modal, closeHealthAlertsWidget);
    await _refresh();
    if (_refreshTimer == null) {
        _refreshTimer = setInterval(() => {
            _refresh().catch((err) => console.debug('[health-alerts:auto-refresh]', err?.message || err));
        }, AUTO_REFRESH_MS);
    }
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('health-alerts');
}
/**
 * Close the modal (preserves DOM for fast re-open). Stops auto-refresh.
 */
export function closeHealthAlertsWidget() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
        modal.style.display = 'none';
        clearDeepLinkUrl();
    }
    if (typeof _a11yCleanup === 'function') {
        _a11yCleanup();
        _a11yCleanup = null;
    }
    if (_refreshTimer != null) {
        clearInterval(_refreshTimer);
        _refreshTimer = null;
    }
}
/** @returns {Promise<void>} */
async function _refresh() {
    const readings = await _loadReadings();
    const summary = computeHealthAlertsSummary(readings);
    _renderSummary(summary);
}
