// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * EIS Drift Alerts — Admin Interface (Vanilla JS).
 *
 * Painel administrativo para revisar e resolver alertas de desvio (drift) das
 * agregações ponderadas do EIS. Apenas a renderização e interação vivem aqui;
 * a matemática de detecção está em `driftEngine.js` e o transporte de rede em
 * `utils/cloud/cronDriftCheck.js`.
 *
 * Estados: Idle (vazio), Loading (spinner), Alert Found (tabela), Resolving.
 */
import { createLogger } from '../../utils/helpers/logger.js';
import { escapeHtml } from '../../utils/helpers/html.js';
import { fetchDriftAlerts, postDriftResolution } from '../../utils/cloud/cronDriftCheck.js';
const log = createLogger('eisDriftAdmin');
const MODAL_ID = 'eis-drift-admin-modal';
/** @type {(k:string)=>string} resolved lazily to avoid circular i18n import */
let _t: any = (k: any) => k;
import('../../utils/i18n/translations.js' as string)
    .then((m) => {
    if (typeof ( /** @type {any} */(m).t) === 'function')
        _t = /** @type {any} */ (m).t;
})
    .catch((e) => log.debug('i18n lazy load:', e?.message || e));
/** @param {string} k @param {string} fallback */
function tr(k: any, fallback: any) {
    try {
        const v = _t(k);
        return v && v !== k ? v : fallback;
    }
    catch {
        return fallback;
    }
}
/** Inline severity color (não depender só de cor — ícone de aviso acompanha).
 *  WCAG 1.4.3: valores calibrados p/ o fundo escuro do .ecbt-dialog (#1e1e2e) —
 *  #ef4444 media 4.36:1 e #3b82f6 4.46:1 (abaixo de 4.5:1 p/ texto 14px). */
const SEVERITY_COLOR = {
    critical: '#f87171',
    high: '#f97316',
    med: '#eab308',
    low: '#60a5fa',
};
/** @param {string} sev */
function severityLabel(sev: any) {
    const map = {
        critical: tr('eisDrift.sevCritical', 'Critical'),
        high: tr('eisDrift.sevHigh', 'High'),
        med: tr('eisDrift.sevMed', 'Medium'),
        low: tr('eisDrift.sevLow', 'Low'),
    };
    return (map as Record<string, any>)[sev] || sev;
}
/** Build the modal shell once. @returns {HTMLElement} */
function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal)
        return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ecbt-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', tr('eisDrift.title', 'EIS Drift Alerts'));
    modal.innerHTML = `
      <div class="ecbt-dialog ecbt-dialog--xl">
        <div class="ecbt-dialog__header">
          <h2>${escapeHtml(tr('eisDrift.title', 'EIS Drift Alerts'))}</h2>
          <button type="button" class="ecbt-dialog__close" aria-label="Close"
            data-cc-action="cc-dba91a4d">&times;</button>
        </div>
        <div class="ecbt-dialog__body" id="eis-drift-body" aria-live="polite"></div>
      </div>`;
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal)
            closeAdminInterface();
    });
    document.body.appendChild(modal);
    return modal;
}
/** Render the alert table or empty/loading state into the body. @param {any} state */
function renderBody(state: any) {
    const body = document.getElementById('eis-drift-body');
    if (!body)
        return;
    if (state.loading) {
        body.innerHTML = `<div style="text-align:center;padding:32px"><div class="ecbt-spinner"></div></div>`;
        return;
    }
    if (state.offline) {
        body.innerHTML = `<p role="alert" style="padding:16px">${escapeHtml(tr('eisDrift.offline', 'Drift backend unavailable. Run: npm run tools'))}</p>`;
        return;
    }
    const alerts = Array.isArray(state.alerts) ? state.alerts : [];
    if (!alerts.length) {
        body.innerHTML = `<p style="padding:24px;text-align:center;opacity:.7">${escapeHtml(tr('eisDrift.empty', 'No drift detected'))}</p>`;
        return;
    }
    body.innerHTML = `
      <table style="width:100%;border-collapse:collapse" aria-label="${escapeHtml(tr('eisDrift.title', 'EIS Drift Alerts'))}">
        <thead><tr style="text-align:left;border-bottom:1px solid var(--border,#444)">
          <th>${escapeHtml(tr('eisDrift.colSeverity', 'Severity'))}</th>
          <th>${escapeHtml(tr('eisDrift.colParameter', 'Parameter'))}</th>
          <th>${escapeHtml(tr('eisDrift.colDelta', 'Delta'))}</th>
          <th>${escapeHtml(tr('eisDrift.colStatus', 'Status'))}</th>
          <th>${escapeHtml(tr('eisDrift.colActions', 'Actions'))}</th>
        </tr></thead>
        <tbody>${alerts.map(rowHtml).join('')}</tbody>
      </table>`;
}
/** @param {any} a @returns {string} */
function rowHtml(a: any) {
    const sev = String(a.severity || 'low');
    const color = (SEVERITY_COLOR as any)[sev] || '#888';
    const id = escapeHtml(String(a.id || ''));
    const pct = ((Number(a.delta_value) || 0) * 100).toFixed(1);
    const wd = a.runtime_payload?.weightDrift || [];
    const drill = Array.isArray(wd) && wd.length
        ? `<div style="font-size:11px;opacity:.75;margin-top:4px">${wd
            .map((/** @type {any} */ w) => `${escapeHtml(String(w.axis))}: ${Number(w.sql).toFixed(2)} &rarr; ${Number(w.runtime).toFixed(2)}`)
            .join(' · ')}</div>`
        : '';
    /* role="alert" no <tr> quebrava a semântica da tabela (axe
       aria-required-children: a row saía da árvore do table). O anúncio
       live já está coberto pelo aria-live="polite" do #eis-drift-body. */
    return `<tr style="border-left:4px solid ${color}">
      <td style="color:${color};font-weight:600">&#9888; ${escapeHtml(severityLabel(sev))}</td>
      <td>${escapeHtml(String(a.parameter_id || '—'))}${drill}</td>
      <td>${pct}%</td>
      <td>${escapeHtml(tr('eisDrift.statusActive', 'Active'))}</td>
      <td>
        <button type="button" class="ecbt-btn ecbt-btn--sm"
          data-cc-call-click="handleResolveDriftAlert|s:${encodeURIComponent(`${id}`)}|s:RECONCILE">
          ${escapeHtml(tr('eisDrift.reconcile', 'Reconcile'))}</button>
        <button type="button" class="ecbt-btn ecbt-btn--sm ecbt-btn--danger"
          aria-label="${escapeHtml(tr('eisDrift.ignore', 'Ignore'))}"
          data-cc-call-click="handleResolveDriftAlert|s:${encodeURIComponent(`${id}`)}|s:IGNORE">&times;</button>
      </td>
    </tr>`;
}
/** Open + load alerts. @returns {Promise<void>} */
export async function openAdminInterface() {
    const modal = ensureModal();
    modal.style.display = 'flex';
    renderBody({ loading: true });
    const res = await fetchDriftAlerts();
    renderBody({ loading: false, offline: res.offline, alerts: res.alerts });
}
/** Close the modal. */
export function closeAdminInterface() {
    const modal = document.getElementById(MODAL_ID);
    if (modal)
        modal.style.display = 'none';
}
/**
 * Resolve an alert and refresh the list.
 *
 * @param {string} alertId
 * @param {'RECONCILE'|'IGNORE'|'INVESTIGATE'} action
 * @returns {Promise<{ok:boolean,error?:string}>}
 */
export async function resolveDriftAlert(alertId: any, action: any) {
    const res = await postDriftResolution(alertId, action);
    if (res.ok) {
        const fresh = await fetchDriftAlerts();
        renderBody({ loading: false, offline: fresh.offline, alerts: fresh.alerts });
    }
    return res;
}
