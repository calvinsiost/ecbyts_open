// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   ORGANIZATION PANEL — UI for org management
   Renders inside a modal overlay (dynamic, like cloud panel).
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
/**
 * Render the organization management panel.
 */
export async function renderOrgPanel() {
    const { loadUserOrgs, getActiveOrg, getOrgMembers, getOrgInvites } = await import('../auth/organizations.js' as string);
    await loadUserOrgs();
    const org = getActiveOrg();
    // Get/create overlay
    let overlay = document.getElementById('org-panel-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'org-panel-overlay';
        overlay.className = 'ecbt-overlay';
        (overlay as any)?.addEventListener("click", (e: any) => {
            if (e.target === overlay) (overlay as any).style.display = 'none';
        });
        document.body.appendChild(overlay);
    }
    let html = `<div class="ecbt-dialog ecbt-dialog--md" role="dialog" aria-modal="true" aria-labelledby="org-panel-title">
        <div class="ecbt-header">
            <h3 class="ecbt-title" id="org-panel-title">${escapeHtml(t('org.title') || 'Organization')}</h3>
            <button class="ecbt-close" aria-label="${escapeHtml(t('close') || 'Close')}" data-cc-action="cc-2f78a6c4">&times;</button>
        </div>
        <div class="ecbt-form" style="max-height:70vh;overflow-y:auto">`;
    if (!org) {
        // No org - show create form
        html += _renderCreateSection();
    } else {
        // Has org - show info + members + invites
        html += _renderOrgInfo(org);
        const members = await getOrgMembers(org.id);
        html += _renderMembersTable(members, org.orgRole);
        if (org.orgRole === 'owner' || org.orgRole === 'admin') {
            const invites = await getOrgInvites(org.id);
            html += _renderInvitesTable(invites);
            html += _renderInviteForm();
        }
    }
    html += `</div></div>`;
    overlay.innerHTML = html;
    (overlay as any).style.display = 'flex';
}
function _renderCreateSection() {
    return `
        <div style="text-align:center;padding:24px 0">
            <h4>${escapeHtml(t('org.createTitle') || 'Create Organization')}</h4>
            <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">
                ${escapeHtml(t('org.createDesc') || 'Create a workspace for your team to share models and collaborate.')}
            </p>
            <input data-field-meta="true" data-field-meta-key="auto:org-create-name" type="text" id="org-create-name" placeholder="${escapeHtml(t('org.namePlaceholder') || 'Organization name')}"
                   aria-label="${escapeHtml(t('org.namePlaceholder') || 'Organization name')}"
                   style="width:100%;max-width:300px;margin-bottom:12px" class="form-input" />
            <br/>
            <button class="btn btn-primary" data-cc-action="cc-ff17ed08">
                ${escapeHtml(t('org.createBtn') || 'Create Organization')}
            </button>
        </div>`;
}
/**
 * @param {any} org
 */
function _renderOrgInfo(org: any) {
    const planBadge = org.plan === 'enterprise' ? 'Enterprise' : org.plan === 'professional' ? 'Pro' : 'Free';
    const canOpenShares = org.orgRole === 'owner' || org.orgRole === 'admin';
    return `
        <div style="padding:12px 0;border-bottom:1px solid var(--border-color)">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <strong style="font-size:16px">${escapeHtml(org.name)}</strong>
                    <span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">${escapeHtml(org.slug)}</span>
                </div>
                <span class="credential-badge credential-badge--approved" style="font-size:10px">${escapeHtml(planBadge)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                ${escapeHtml(t('org.yourRole') || 'Your role')}: <strong>${escapeHtml(org.orgRole)}</strong>
            </div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
                <button class="btn btn-sm" data-cc-action="cc-5e9cdd29" ${canOpenShares ? '' : 'disabled'}
                    title="${canOpenShares ? 'Open resource shares panel' : 'Admin/owner required'}">
                    Resource Shares
                </button>
                <span style="font-size:11px;color:var(--text-tertiary);">
                    ${canOpenShares ? 'Manage org resource access' : 'Only owner/admin can manage shares'}
                </span>
            </div>
        </div>`;
}
/**
 * @param {any} members
 * @param {any} myRole
 */
function _renderMembersTable(members: any, myRole: any) {
    const isAdmin = myRole === 'owner' || myRole === 'admin';
    let html = `<h4 class="credential-section-title" style="margin-top:16px">${escapeHtml(t('org.members') || 'Members')} (${members.length})</h4>`;
    if (members.length === 0) {
        return html + `<p class="credential-empty">${escapeHtml(t('org.noMembers') || 'No members')}</p>`;
    }
    html += `<table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr>
            <th style="text-align:left;padding:6px 4px">${escapeHtml(t('org.memberName') || 'Name')}</th>
            <th style="text-align:left;padding:6px 4px">${escapeHtml(t('org.role') || 'Role')}</th>
            <th style="text-align:right;padding:6px 4px"></th>
        </tr></thead><tbody>`;
    for (const m of members) {
        html += `<tr style="border-bottom:1px solid var(--border-color,rgba(255,255,255,0.06))">
            <td style="padding:6px 4px">${escapeHtml(m.displayName)}</td>
            <td style="padding:6px 4px">${escapeHtml(m.orgRole)}</td>
            <td style="padding:6px 4px;text-align:right">
                ${isAdmin && m.orgRole !== 'owner' ? `<button class="btn btn-xs" style="font-size:10px" aria-label="${escapeHtml(t('org.removeMember') || 'Remove member')}: ${escapeHtml(m.displayName)}" data-cc-call-click="handleRemoveMember|s:${encodeURIComponent(`${m.userId}`)}">&#10005;</button>` : ''}
            </td>
        </tr>`;
    }
    html += `</tbody></table>`;
    return html;
}
/**
 * @param {any} invites
 */
function _renderInvitesTable(invites: any) {
    let html = `<h4 class="credential-section-title" style="margin-top:16px">${escapeHtml(t('org.pendingInvites') || 'Pending Invites')}</h4>`;
    if (invites.length === 0) {
        return html + `<p class="credential-empty">${escapeHtml(t('org.noInvites') || 'No pending invites')}</p>`;
    }
    html += `<div style="display:flex;flex-direction:column;gap:6px">`;
    for (const inv of invites) {
        const expires = new Date(inv.expires_at).toLocaleDateString();
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--neutral-100,rgba(255,255,255,0.03));border-radius:4px;font-size:12px">
            <div>
                <span>${escapeHtml(inv.email)}</span>
                <span style="color:var(--text-tertiary);margin-left:6px">(${escapeHtml(inv.org_role)})</span>
                <span style="color:var(--text-tertiary);margin-left:6px">exp: ${escapeHtml(expires)}</span>
            </div>
            <div style="display:flex;gap:4px">
                <button class="btn btn-xs" style="font-size:10px" aria-label="${escapeHtml(t('org.copyInviteLink') || 'Copy invite link')}: ${escapeHtml(inv.email)}" data-cc-call-click="handleCopyInviteLink|s:${encodeURIComponent(`${inv.token}`)}">&#8599;</button>
                <button class="btn btn-xs" style="font-size:10px" aria-label="${escapeHtml(t('org.cancelInvite') || 'Cancel invite')}: ${escapeHtml(inv.email)}" data-cc-call-click="handleCancelInvite|s:${encodeURIComponent(`${inv.id}`)}">&#10005;</button>
            </div>
        </div>`;
    }
    html += `</div>`;
    return html;
}
function _renderInviteForm() {
    return `
        <h4 class="credential-section-title" style="margin-top:16px">${escapeHtml(t('org.inviteMember') || 'Invite Member')}</h4>
        <div style="display:flex;gap:8px;align-items:flex-end">
            <input type="email" id="org-invite-email" placeholder="email@example.com"
                   aria-label="Email"
                   class="form-input" style="flex:1;font-size:12px" />
            <select data-field-meta="true" data-field-meta-key="auto:org-invite-role" id="org-invite-role" aria-label="${escapeHtml(t('org.role') || 'Role')}" class="form-input" style="width:100px;font-size:12px">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="guest">Guest</option>
            </select>
            <button class="btn btn-primary btn-sm" data-cc-action="cc-862ff17f">
                ${escapeHtml(t('org.inviteBtn') || 'Invite')}
            </button>
        </div>`;
}
