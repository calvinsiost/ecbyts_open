// @ts-check
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
   PERMISSIONS MODAL — Manage access rules (RBAC)
   Modal para gerenciar regras de acesso por papel e acao

   Permite ao admin/owner:
   - Listar regras existentes (email, papel, area, overrides)
   - Adicionar novas regras com overrides por acao
   - Editar/remover regras existentes
   ================================================================ */
import { t } from '../i18n/translations.js';
import { getRules, addRule, updateRule, removeRule, VALID_ACTIONS, isOwner, isAdmin } from '../auth/permissions.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _overlay: any = null;
let _editingIndex = -1; // -1 = adding new, >= 0 = editing existing
// Roles available for assignment (owner is implicit, none means remove)
const ASSIGNABLE_ROLES = ['admin', 'editor', 'viewer', 'observer'];
// Actions available for override checkboxes
const OVERRIDE_ACTIONS = [...VALID_ACTIONS];
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Open the permissions management modal.
 * Abre o modal de gerenciamento de permissoes.
 */
export function openPermissionsModal() {
    if (!isOwner() && !isAdmin()) {
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return;
    }
    if (_overlay) return; // Already open
    _overlay = document.createElement('div');
    _overlay.className = 'ecbt-overlay';
    const modal = document.createElement('div');
    modal.className = 'ecbt-dialog ecbt-dialog--lg permissions-modal';
    // WCAG 4.1.2 — semântica de dialog + nome acessível via título.
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'perm-modal-title');
    modal.innerHTML = _buildModalHTML();
    _overlay.appendChild(modal);
    document.body.appendChild(_overlay);
    // Event delegation
    modal.addEventListener('click', _handleClick);
    _overlay.addEventListener("click", (e: any) => {
        if (e.target === _overlay) _close();
    });
    // Escape to close
    _overlay._keyHandler = (e: any) => {
        if (e.key === 'Escape') _close();
    };
    document.addEventListener('keydown', _overlay._keyHandler);
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('permissions');
}
// ----------------------------------------------------------------
// HTML BUILDERS
// ----------------------------------------------------------------
/**
 * Build the full modal HTML content.
 * @returns {string}
 */
function _buildModalHTML() {
    const rules = getRules();
    const title = t('permissions.title') || 'Access Rules';
    const addBtn = t('permissions.addRule') || 'Add Rule';
    let html = `<div class="ecbt-header">
        <h3 class="ecbt-title" id="perm-modal-title">${escapeHtml(title)}</h3>
        <button data-action="close" class="ecbt-close" aria-label="Close">&#10005;</button>
    </div>`;
    html += '<div class="ecbt-form">';
    // Rules list
    if (rules.length === 0) {
        html += `<p class="perm-empty">${escapeHtml(t('permissions.noRules') || 'No access rules configured. All users have full access.')}</p>`;
    } else {
        html += '<div class="perm-rules-list">';
        for (let i = 0; i < rules.length; i++) {
            html += _buildRuleRow(rules[i], i);
        }
        html += '</div>';
    }
    // Add rule button
    html += `<button data-action="add" class="perm-add-btn">${escapeHtml(addBtn)}</button>`;
    // Form area (hidden initially)
    html += '<div id="perm-form-area" style="display:none;"></div>';
    html += '</div>'; // close ecbt-form
    return html;
}
/**
 * Build a single rule row.
 * @param {any} rule
 * @param {number} index
 * @returns {string}
 */
function _buildRuleRow(rule: any, index: any) {
    const email = escapeHtml(rule.email || '(no email)');
    const role = escapeHtml(rule.role || 'viewer');
    const areas = rule.areas ? (Array.isArray(rule.areas) ? rule.areas.join(', ') : String(rule.areas)) : '*';
    const overrides = rule.actionOverrides || {};
    const overrideStr =
        Object.entries(overrides)
            .map(([a, v]) => `${a}:${v}`)
            .join(', ') || '--';
    return `<div class="perm-rule" data-rule-index="${index}">
        <div class="perm-rule-info">
            <div class="perm-rule-email">${email} <span class="perm-rule-role">[${role}]</span></div>
            <div class="perm-rule-meta">Areas: ${escapeHtml(areas)} | Overrides: ${escapeHtml(overrideStr)}</div>
        </div>
        <button data-action="edit" data-index="${index}" class="perm-rule-btn perm-rule-btn--edit">${escapeHtml(t('edit') || 'Edit')}</button>
        <button data-action="remove" data-index="${index}" class="perm-rule-btn perm-rule-btn--remove">${escapeHtml(t('remove') || 'Remove')}</button>
    </div>`;
}
/**
 * Build the add/edit form HTML.
 * @param {any} rule - Existing rule for editing, null for new
 * @returns {string}
 */
function _buildForm(rule: any) {
    const email = rule?.email || '';
    const role = rule?.role || 'viewer';
    const areas = rule?.areas ? (Array.isArray(rule.areas) ? rule.areas.join(', ') : '') : '*';
    const overrides = rule?.actionOverrides || {};
    const saveLabel = escapeHtml(t('save') || 'Save');
    const cancelLabel = escapeHtml(t('cancel') || 'Cancel');
    let html = `<div class="perm-form">
        <div class="perm-form-grid">
            <div class="perm-form-field">
                <label for="perm-email">Email</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:permissionsModal:input:L176" id="perm-email" type="email" value="${escapeHtml(email)}" />
            </div>
            <div class="perm-form-field">
                <label for="perm-role">${escapeHtml(t('role') || 'Role')}</label>
                <select data-field-meta="true" data-field-meta-key="auto:perm-role" id="perm-role">`;
    for (const r of ASSIGNABLE_ROLES) {
        const sel = r === role ? ' selected' : '';
        html += `<option value="${r}"${sel}>${r}</option>`;
    }
    html += `</select>
            </div>
        </div>
        <div class="perm-form-field" style="margin-bottom:12px;">
            <label for="perm-areas">${escapeHtml(t('permissions.areas') || 'Areas (comma-separated, * = all)')}</label>
            <input data-field-meta="true" data-field-meta-key="auto:perm-areas" id="perm-areas" type="text" value="${escapeHtml(areas)}" />
        </div>
        <div class="perm-form-field" style="margin-bottom:12px;">
            <label>${escapeHtml(t('permissions.actionOverrides') || 'Action Overrides')}</label>
            <div class="perm-overrides-grid">`;
    for (const action of OVERRIDE_ACTIONS) {
        const current = overrides[action] || '';
        html += `<div class="perm-override-item">
            <span class="perm-override-label">${escapeHtml(action)}</span>
            <select data-field-meta="true" data-field-meta-key="auto-pos:permissionsModal:select:L202" data-override-action="${action}" aria-label="${escapeHtml(action)} override">
                <option value=""${current === '' ? ' selected' : ''}>(default)</option>
                <option value="grant"${current === 'grant' ? ' selected' : ''}>grant</option>
                <option value="deny"${current === 'deny' ? ' selected' : ''}>deny</option>
            </select>
        </div>`;
    }
    html += `</div>
        </div>
        <div class="ecbt-actions">
            <button data-action="cancel-form" class="ecbt-btn ecbt-btn--cancel">${cancelLabel}</button>
            <button data-action="save-form" class="ecbt-btn ecbt-btn--primary">${saveLabel}</button>
        </div>
    </div>`;
    return html;
}
// ----------------------------------------------------------------
// EVENT HANDLING
// ----------------------------------------------------------------
/**
 * Handle clicks inside the modal via delegation.
 * @param {MouseEvent} e
 */
function _handleClick(e: any) {
    const btn = /*as:Element|null*/ e.target?.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action || '';
    const index = btn.dataset.index !== undefined ? parseInt(btn.dataset.index, 10) : -1;
    switch (action) {
        case 'close':
            _close();
            break;
        case 'add':
            _editingIndex = -1;
            _showForm(null);
            break;
        case 'edit':
            _editingIndex = index;
            _showForm(getRules()[index]);
            break;
        case 'remove':
            removeRule(index);
            _refresh();
            showToast(t('permissions.ruleRemoved') || 'Rule removed', 'info');
            break;
        case 'cancel-form':
            _hideForm();
            break;
        case 'save-form':
            _saveForm();
            break;
    }
}
/**
 * Show the add/edit form.
 * @param {any} rule
 */
function _showForm(rule: any) {
    const area = _overlay?.querySelector('#perm-form-area');
    if (!area) return;
    area.style.display = 'block';
    area.innerHTML = _buildForm(rule);
}
/**
 * Hide the form area.
 */
function _hideForm() {
    const area = _overlay?.querySelector('#perm-form-area');
    if (area) {
        area.style.display = 'none';
        area.innerHTML = '';
    }
    _editingIndex = -1;
}
/**
 * Save form data as new or updated rule.
 */
function _saveForm() {
    const email = _overlay?.querySelector('#perm-email')?.value?.trim();
    const role = _overlay?.querySelector('#perm-role')?.value || 'viewer';
    const areasRaw = _overlay?.querySelector('#perm-areas')?.value?.trim() || '*';
    if (!email) {
        showToast(t('permissions.emailRequired') || 'Email is required', 'error');
        return;
    }
    const areas = areasRaw
        .split(',')
        .map((s: any) => s.trim())
        .filter(Boolean);
    // Collect action overrides
    const actionOverrides: Record<string, any> = {};
    const selects = _overlay?.querySelectorAll('[data-override-action]') || [];
    for (const sel of selects) {
        const act = sel.dataset.overrideAction || '';
        const val = sel.value;
        if (val === 'grant' || val === 'deny') {
            actionOverrides[act] = val;
        }
    }
    const ruleData = { email, role, areas, actionOverrides };
    if (_editingIndex >= 0) {
        updateRule(_editingIndex, ruleData);
        showToast(t('permissions.ruleUpdated') || 'Rule updated', 'success');
    } else {
        addRule(ruleData);
        showToast(t('permissions.ruleAdded') || 'Rule added', 'success');
    }
    _hideForm();
    _refresh();
}
/**
 * Refresh the modal content (re-render rules list).
 */
function _refresh() {
    if (!_overlay) return;
    const modal = _overlay.querySelector('.permissions-modal');
    if (modal) {
        modal.innerHTML = _buildModalHTML();
    }
}
/**
 * Close the permissions modal.
 */
function _close() {
    if (_overlay) {
        if (_overlay._keyHandler) {
            document.removeEventListener('keydown', _overlay._keyHandler);
        }
        _overlay.remove();
        _overlay = null;
        _editingIndex = -1;
        clearDeepLinkUrl();
    }
}
