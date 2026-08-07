// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   ORGANIZATION HANDLERS — Window.* functions for org management
   Feature-gated by CONFIG.ENABLE_ORGS.
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { showToast } from '../ui/toast.js';
import { createNotification } from '../../core/notifications/manager.js';
import { t } from '../i18n/translations.js';
/**
 * Open the organization management modal.
 *
 * 2026-04-11 fix (click-everything finding): renderOrgPanel was called without
 * await, so its rejection ("User not authenticated" when no user) escaped the
 * try/catch and surfaced as an unhandled promise rejection in the global
 * window.onunhandledrejection listener - visible in the console as a real bug.
 */
async function handleOpenOrgModal() {
    try {
        const { renderOrgPanel } = await import('../ui/orgPanel.js' as string);
        await renderOrgPanel();
    }
    catch (err: any) {
        console.error('[orgs] handleOpenOrgModal:', err);
        showToast(err?.message || 'Error opening organization panel', 'error');
    }
}
/**
 * Create a new organization.
 */
async function handleCreateOrg() {
    const input = document.getElementById('org-create-name');
    const name = (input as any)?.value?.trim();
    if (!name) {
        showToast(t('org.nameRequired') || 'Organization name is required', 'error');
        return;
    }
    try {
        const { createOrg } = await import('../auth/organizations.js' as string);
        const org = await createOrg(name);
        showToast(`${t('org.created') || 'Organization created'}: ${escapeHtml(org.slug)}`, 'success');
        handleOpenOrgModal(); // refresh
    }
    catch (err: any) {
        showToast(err?.message || 'Error', 'error');
    }
}
/**
 * Invite a member to the active organization.
 */
async function handleInviteMember() {
    const emailInput = document.getElementById('org-invite-email');
    const roleSelect = document.getElementById('org-invite-role');
    const email = (emailInput as any)?.value?.trim();
    const role = (roleSelect as any)?.value || 'member';
    if (!email) {
        showToast(t('org.emailRequired') || 'Email is required', 'error');
        return;
    }
    const orgId = sessionStorage.getItem('ecbyts-active-org') || '';
    if (!orgId) {
        showToast(t('org.noActiveOrg') || 'No active organization', 'error');
        return;
    }
    try {
        const { inviteMember } = await import('../auth/organizations.js' as string);
        const invite = await inviteMember(orgId, email, role);
        // Build invite link
        const link = `${window.location.origin}${window.location.pathname}?org_invite=${invite.token}`;
        await navigator.clipboard.writeText(link);
        showToast(`${t('org.inviteSent') || 'Invite link copied'}: ${escapeHtml(email)}`, 'success');
        // Notificar usuário convidado se já existe na plataforma
        try {
            const { getSupabaseClient } = await import('../auth/session.js' as string);
            const sb = getSupabaseClient();
            if (sb) {
                const { data: profile } = await sb
                    .from('profiles')
                    .select('id')
                    .eq('email', email.toLowerCase().trim())
                    .maybeSingle();
                if (profile?.id) {
                    await createNotification({
                        userId: profile.id,
                        type: 'org.invitation',
                        priority: 'P1',
                        payload: {
                            title: 'Convite para organização',
                            body: `Você foi convidado para entrar em uma organização.`,
                        },
                    });
                }
            }
        }
        catch (e: any) {
            console.debug('[handlers/org] notifyInvite:', e?.message || e);
        }
        if (emailInput)
            (emailInput as any).value = '';
        handleOpenOrgModal(); // refresh
    }
    catch (err: any) {
        showToast(err?.message || 'Error', 'error');
    }
}
/**
 * Remove a member from the active organization.
 * @param {string} userId
 */
async function handleRemoveMember(userId: any) {
    const orgId = sessionStorage.getItem('ecbyts-active-org') || '';
    if (!orgId)
        return;
    try {
        const { removeMember } = await import('../auth/organizations.js' as string);
        await removeMember(orgId, userId);
        showToast(t('org.memberRemoved') || 'Member removed', 'success');
        handleOpenOrgModal(); // refresh
    }
    catch (err: any) {
        showToast(err?.message || 'Error', 'error');
    }
}
/**
 * Cancel a pending invite.
 * @param {string} inviteId
 */
async function handleCancelInvite(inviteId: any) {
    try {
        const { cancelInvite } = await import('../auth/organizations.js' as string);
        await cancelInvite(inviteId);
        showToast(t('org.inviteCanceled') || 'Invite canceled', 'success');
        handleOpenOrgModal(); // refresh
    }
    catch (err: any) {
        showToast(err?.message || 'Error', 'error');
    }
}
/**
 * Accept an organization invite by token.
 * @param {string} token
 */
async function handleAcceptOrgInvite(token: any) {
    try {
        const { acceptInvite, setActiveOrg } = await import('../auth/organizations.js' as string);
        const result = await acceptInvite(token);
        await setActiveOrg(result.orgId);
        showToast(`${t('org.inviteAccepted') || 'You joined'} ${escapeHtml(result.orgName)}!`, 'success');
    }
    catch (err: any) {
        showToast(err?.message || 'Error', 'error');
    }
}
/**
 * Copy an invite link to clipboard.
 * @param {string} token
 */
async function handleCopyInviteLink(token: any) {
    const link = `${window.location.origin}${window.location.pathname}?org_invite=${token}`;
    try {
        await navigator.clipboard.writeText(link);
        showToast(t('org.linkCopied') || 'Link copied to clipboard', 'success');
    }
    catch {
        // Fallback for non-HTTPS
        const ta = document.createElement('textarea');
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(t('org.linkCopied') || 'Link copied', 'success');
    }
}
/**
 * Switch active organization.
 * @param {string} orgId
 */
async function handleSwitchOrg(orgId: any) {
    try {
        const { setActiveOrg, getActiveOrg } = await import('../auth/organizations.js' as string);
        await setActiveOrg(orgId);
        const org = getActiveOrg();
        showToast(`${t('org.switchedTo') || 'Switched to'} ${escapeHtml(org?.name || orgId)}`, 'success');
        handleOpenOrgModal(); // refresh
    }
    catch (err: any) {
        showToast(err?.message || 'Error', 'error');
    }
}
/**
 * Transfer organization ownership.
 * @param {string} newOwnerUserId
 */
async function handleTransferOwnership(newOwnerUserId: any) {
    const orgId = sessionStorage.getItem('ecbyts-active-org') || '';
    if (!orgId)
        return;
    try {
        const { transferOwnership } = await import('../auth/organizations.js' as string);
        await transferOwnership(orgId, newOwnerUserId);
        showToast(t('org.ownershipTransferred') || 'Ownership transferred', 'success');
        handleOpenOrgModal(); // refresh
    }
    catch (err: any) {
        showToast(err?.message || 'Error', 'error');
    }
}
// ================================================================
// EXPORT
// ================================================================
export const orgHandlers = {
    handleOpenOrgModal,
    handleCreateOrg,
    handleInviteMember,
    handleRemoveMember,
    handleCancelInvite,
    handleAcceptOrgInvite,
    handleCopyInviteLink,
    handleSwitchOrg,
    handleTransferOwnership,
};
