// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * SHARE-001 Phase 3 - Resource shares CRUD panel
 *
 * Modal that lets org admins list, grant, and revoke shares against
 * the resource_shares table (migration 20260411000000_resource_shares.sql).
 *
 * Gating: every mutation runs through canCurrent(ACTIONS.SHARE) so the
 * button is disabled when the active org role lacks permission. The
 * server still enforces RLS - this is purely a UX guard.
 *
 * Why a thin file: persistent business logic stays in core/sharing/
 * (pure policy) and utils/auth/organizations.js (Supabase ops). This
 * file is a view that wires both to a list + form.
 */
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { getSupabaseClient } from '../auth/session.js';
import { getActiveOrg, canCurrent, ACTIONS } from '../auth/organizations.js';
import { validateShareGrant } from '../../core/sharing/policy.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _overlay: any = null;
let _shares: any[] = [];
// PERF-MASTER S3.3 - listener cleanup via AbortController.
// Cada open/close cycle cria/aborta um controller dedicado, evitando
// que listeners de re-mount empilhem em DOM nodes antigos.
let _abortController: any = null;
// ----------------------------------------------------------------
// DATA LAYER - thin Supabase wrappers
// ----------------------------------------------------------------
/**
 * @param {any} orgId
 */
async function _fetchShares(orgId: any) {
    /** @type {any} */
    const client = getSupabaseClient();
    if (!client)
        return [];
    const { data, error } = await client
        .from('resource_shares')
        .select('id, resource_type, resource_id, grantee_id, scope, created_at, expires_at, revoked_at')
        .eq('org_id', orgId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
    if (error) {
        console.warn('[shares] fetch failed:', error.message);
        return [];
    }
    return data || [];
}
/**
 * @param {any} orgId
 * @param {any} payload
 */
async function _insertShare(orgId: any, payload: any) {
    /** @type {any} */
    const client = getSupabaseClient();
    if (!client)
        throw new Error('supabase_unavailable');
    const { data: userData } = await client.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId)
        throw new Error('not_authenticated');
    const row = {
        org_id: orgId,
        resource_type: payload.resourceType,
        resource_id: payload.resourceId,
        grantee_id: payload.granteeId,
        scope: payload.scope,
        granted_by: userId,
        expires_at: payload.expiresAt || null,
    };
    const { data, error } = await client.from('resource_shares').insert(row).select('id').single();
    if (error)
        throw new Error(error.message);
    return data;
}
/**
 * @param {any} shareId
 */
async function _revokeShare(shareId: any) {
    /** @type {any} */
    const client = getSupabaseClient();
    if (!client)
        throw new Error('supabase_unavailable');
    const { error } = await client
        .from('resource_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', shareId);
    if (error)
        throw new Error(error.message);
}
// ----------------------------------------------------------------
// VIEW
// ----------------------------------------------------------------
function _createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'shares-panel-overlay';
    overlay.className = 'ecbt-overlay modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', 'shares-panel-title');
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="modal" id="shares-panel-modal" style="max-width:760px;width:90vw;max-height:85vh;display:flex;flex-direction:column;">
        <header class="modal-header">
          <h2 id="shares-panel-title">Resource shares</h2>
          <button id="shares-panel-close" class="modal-close" aria-label="Close">&#215;</button>
        </header>
        <div class="modal-body" style="overflow:auto;flex:1;">
          <section id="shares-panel-grant-section" style="margin-bottom:16px;padding:12px;border:1px solid var(--neutral-300);border-radius:6px;">
            <h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;">Grant new share</h3>
            <form id="shares-panel-form" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <label style="display:flex;flex-direction:column;font-size:11px;">
                Resource type
                <select data-field-meta="true" data-field-meta-key="auto:share-resource-type" id="share-resource-type" required>
                  <option value="model">model</option>
                  <option value="document">document</option>
                  <option value="report">report</option>
                  <option value="dataset">dataset</option>
                </select>
              </label>
              <label style="display:flex;flex-direction:column;font-size:11px;">
                Resource ID
                <input data-field-meta="true" data-field-meta-key="auto:share-resource-id" id="share-resource-id" type="text" required minlength="1" maxlength="200" />
              </label>
              <label style="display:flex;flex-direction:column;font-size:11px;">
                Grantee user ID
                <input data-field-meta="true" data-field-meta-key="auto:share-grantee-id" id="share-grantee-id" type="text" required minlength="1" maxlength="64" placeholder="UUID" />
              </label>
              <label style="display:flex;flex-direction:column;font-size:11px;">
                Scope
                <select data-field-meta="true" data-field-meta-key="auto:share-scope" id="share-scope" required>
                  <option value="read">read</option>
                  <option value="write">write</option>
                  <option value="share">share</option>
                </select>
              </label>
              <label style="display:flex;flex-direction:column;font-size:11px;grid-column:1/-1;">
                Expires at (optional)
                <input data-field-meta="true" data-field-meta-key="auto:share-expires-at" id="share-expires-at" type="datetime-local" />
              </label>
              <div style="grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;">
                <button type="submit" id="share-grant-btn" class="btn btn-primary">Grant</button>
              </div>
            </form>
            <p id="shares-panel-gate-msg" style="margin:8px 0 0;font-size:11px;color:var(--neutral-500);display:none;">
              Insufficient permissions in the active org to grant shares.
            </p>
          </section>

          <section>
            <h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;">Active shares</h3>
            <div id="shares-panel-list" aria-live="polite">Loading…</div>
          </section>
        </div>
      </div>
    `;
    // PERF-MASTER S3.3 - todos os listeners do overlay compartilham
    // o signal do _abortController atual; cleanup atômico no closeSharesPanel().
    const signal: any = _abortController?.signal;
    (overlay.querySelector('#shares-panel-close') as any).addEventListener('click', closeSharesPanel, {
        signal,
    });
    overlay.addEventListener('click', (/** @type {any} */ e) => {
        if (e.target === overlay)
            closeSharesPanel();
    }, { signal });
    (overlay.querySelector('#shares-panel-form') as any).addEventListener('submit', _onSubmitGrant, {
        signal,
    });
    return overlay;
}
function _renderList() {
    const list = _overlay?.querySelector('#shares-panel-list');
    if (!list)
        return;
    if (_shares.length === 0) {
        list.innerHTML = '<p style="font-size:12px;color:var(--neutral-500);">No active shares.</p>';
        return;
    }
    const canRevoke = canCurrent(ACTIONS.SHARE);
    list.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="text-align:left;border-bottom:1px solid var(--neutral-300);">
            <th style="padding:4px;">Type</th>
            <th style="padding:4px;">Resource</th>
            <th style="padding:4px;">Grantee</th>
            <th style="padding:4px;">Scope</th>
            <th style="padding:4px;">Expires</th>
            <th style="padding:4px;"></th>
          </tr>
        </thead>
        <tbody>
          ${_shares
        .map((s: any) => `
            <tr data-share-id="${escapeHtml(s.id)}" style="border-bottom:1px solid var(--neutral-200);">
              <td style="padding:4px;">${escapeHtml(s.resource_type)}</td>
              <td style="padding:4px;font-family:monospace;">${escapeHtml(String(s.resource_id).slice(0, 24))}</td>
              <td style="padding:4px;font-family:monospace;">${escapeHtml(String(s.grantee_id).slice(0, 8))}…</td>
              <td style="padding:4px;">${escapeHtml(s.scope)}</td>
              <td style="padding:4px;">${s.expires_at ? escapeHtml(new Date(s.expires_at).toISOString().slice(0, 10)) : '—'}</td>
              <td style="padding:4px;text-align:right;">
                <button class="btn btn-sm shares-revoke-btn" data-share-id="${escapeHtml(s.id)}" ${canRevoke ? '' : 'disabled'}>
                  Revoke
                </button>
              </td>
            </tr>`)
        .join('')}
        </tbody>
      </table>
    `;
    // PERF-MASTER S3.3 - listeners dos botões revoke também usam o signal
    // do controller ativo; cleanup automático ao fechar o panel.
    const signal: any = _abortController?.signal;
    /** @type {any} */ (list.querySelectorAll('.shares-revoke-btn')).forEach((btn: any) => {
        btn.addEventListener('click', () => _onRevoke(btn.getAttribute('data-share-id')), signal ? { signal } : undefined);
    });
}
function _applyGate() {
    if (!_overlay)
        return;
    const allowed = canCurrent(ACTIONS.SHARE);
    const grantBtn = (_overlay.querySelector('#share-grant-btn')) as any;
    const gateMsg = (_overlay.querySelector('#shares-panel-gate-msg')) as any;
    if (grantBtn)
        grantBtn.disabled = !allowed;
    if (gateMsg)
        gateMsg.style.display = allowed ? 'none' : 'block';
}
async function _refresh() {
    const org = getActiveOrg();
    if (!org) {
        _shares = [];
        const list = _overlay?.querySelector('#shares-panel-list');
        if (list)
            list.innerHTML = '<p style="font-size:12px;">Select an active organization first.</p>';
        return;
    }
    _shares = await _fetchShares(org.id);
    _renderList();
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * @param {any} ev
 */
async function _onSubmitGrant(ev: any) {
    ev.preventDefault();
    if (!canCurrent(ACTIONS.SHARE)) {
        showToast('Insufficient permissions to grant shares', 'error');
        return;
    }
    const org = getActiveOrg();
    if (!org) {
        showToast('No active organization', 'error');
        return;
    }
    const payload = {
        resourceType: /** @type {any} */ (_overlay.querySelector('#share-resource-type')).value,
        resourceId: /** @type {any} */ (_overlay.querySelector('#share-resource-id')).value.trim(),
        granteeId: /** @type {any} */ (_overlay.querySelector('#share-grantee-id')).value.trim(),
        scope: /** @type {any} */ (_overlay.querySelector('#share-scope')).value,
        expiresAt: /** @type {any} */ (_overlay.querySelector('#share-expires-at')).value || null,
    };
    // Client-side validation via the pure policy module
    const v = validateShareGrant(payload);
    if (!v.ok) {
        showToast(`Invalid: ${v.field || 'field'} (${v.reason || 'invalid'})`, 'error');
        return;
    }
    try {
        await _insertShare(org.id, payload);
        showToast('Share granted', 'success');
        /** @type {any} */ (_overlay.querySelector('#shares-panel-form')).reset();
        await _refresh();
    }
    catch (err: any) {
        showToast(`Failed to grant: ${ /** @type {any} */(err).message || 'unknown'}`, 'error');
    }
}
/**
 * @param {any} shareId
 */
async function _onRevoke(shareId: any) {
    if (!shareId)
        return;
    if (!canCurrent(ACTIONS.SHARE)) {
        showToast('Insufficient permissions', 'error');
        return;
    }
    try {
        await _revokeShare(shareId);
        showToast('Share revoked', 'success');
        await _refresh();
    }
    catch (err: any) {
        showToast(`Failed to revoke: ${ /** @type {any} */(err).message || 'unknown'}`, 'error');
    }
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
export function openSharesPanel() {
    // PERF-MASTER S3.3 - abort do controller anterior (se existir) e
    // novo controller para o ciclo aberto. Aborta listeners velhos
    // mesmo se overlay ficou em DOM por race condition.
    if (_abortController) {
        try {
            _abortController.abort();
        }
        catch (e: any) {
            console.debug('[sharesPanel] abortPrev:', /** @type {any} */ (e)?.message || e);
        }
    }
    _abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (!_overlay) {
        _overlay = _createOverlay();
        document.body.appendChild(_overlay);
    }
    _overlay.style.display = 'flex';
    syncDeepLinkUrl('shares');
    _applyGate();
    _refresh().catch((/** @type {any} */ err) => console.warn('[shares] refresh failed:', err));
}
export function closeSharesPanel() {
    if (_overlay)
        _overlay.style.display = 'none';
    clearDeepLinkUrl();
    // PERF-MASTER S3.3 - abort all listeners do ciclo atual.
    // Próximo openSharesPanel() recria controller + listeners.
    if (_abortController) {
        try {
            _abortController.abort();
        }
        catch (e: any) {
            console.debug('[sharesPanel] abortClose:', /** @type {any} */ (e)?.message || e);
        }
        _abortController = null;
    }
    _overlay = null; // próximo open recria, ligado ao novo controller
}
// Test seam - allows E2E to inject fixture rows without Supabase
/**
 * @param {any} rows
 */
export function _setSharesForTesting(rows: any) {
    _shares = Array.isArray(rows) ? rows : [];
    if (_overlay && _overlay.style.display !== 'none')
        _renderList();
}
