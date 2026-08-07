// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Generated from src/app/js/utils/auth/organizations.ts by TS-MIGRATION-001. Do not edit manually.
/* ================================================================
   ORGANIZATIONS — Multi-user workspace management
   ================================================================

   Gerenciamento de organizacoes para equipes (consultorias, orgaos
   ambientais). Feature gated por CONFIG.ENABLE_ORGS.

   ARQUITETURA:
   - Queries e mutations via Supabase PostgREST (RLS enforced)
   - Sem Realtime (refresh manual suficiente)
   - Context via sessionStorage (ecbyts-active-org)
   - Invite link manual (botao Copiar Link)

   TABELAS: organizations, org_members, org_invites
   ADR: docs/SPEC_AUTH_HARDENING.md (Phase 4)
   ================================================================ */
import { getSupabaseClient, getCurrentUser } from './session.js';
import { can as policyCan, hasRoleAtLeast, ACTIONS } from '../../core/sharing/policy.js';
// ================================================================
// INTERNAL STATE
// ================================================================
/** @type {any} */
let _currentOrg: any = null;
/** @type {any} */
let _userOrgs: any = null;
/** @returns {any} */
function _client() {
    const c = getSupabaseClient();
    if (!c) throw new Error('Supabase client not available');
    return c;
}
function _user() {
    const u = getCurrentUser();
    if (!u) throw new Error('User not authenticated');
    return u;
}
// ================================================================
// QUERIES
// ================================================================
/**
 * Load all organizations the current user belongs to.
 * @returns {Promise<Array<{id, name, slug, plan, orgRole, maxMembers}>>}
 */
export async function loadUserOrgs() {
    const client = _client();
    const user = _user();
    const { data, error } = await client
        .from('org_members')
        .select('org_role, organizations(id, name, slug, plan, max_members)')
        .eq('user_id', user.id);
    if (error) {
        console.warn('[orgs] loadUserOrgs:', error.message);
        return [];
    }
    _userOrgs = (data || [])
        .filter((m: any) => m.organizations)
        .map((m: any) => ({
            id: m.organizations.id,
            name: m.organizations.name,
            slug: m.organizations.slug,
            plan: m.organizations.plan,
            maxMembers: m.organizations.max_members,
            orgRole: m.org_role,
        }));
    return _userOrgs;
}
/**
 * Get members of an organization.
 * @param {string} orgId
 * @returns {Promise<Array<any>>}
 */
export async function getOrgMembers(orgId: any) {
    const client = _client();
    const { data, error } = await client
        .from('org_members')
        .select('user_id, org_role, joined_at, profiles(display_name)')
        .eq('org_id', orgId)
        .order('joined_at');
    if (error) {
        console.warn('[orgs] getOrgMembers:', error.message);
        return [];
    }
    return (data || []).map((m: any) => ({
        userId: m.user_id,
        displayName: m.profiles?.display_name || m.user_id.slice(0, 8),
        orgRole: m.org_role,
        joinedAt: m.joined_at,
    }));
}
/**
 * Get pending invites for an organization.
 * @param {string} orgId
 * @returns {Promise<Array<any>>}
 */
export async function getOrgInvites(orgId: any) {
    const client = _client();
    const { data, error } = await client
        .from('org_invites')
        .select('id, email, org_role, token, created_at, expires_at')
        .eq('org_id', orgId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false });
    if (error) {
        console.warn('[orgs] getOrgInvites:', error.message);
        return [];
    }
    return data || [];
}
/**
 * Check if current user has pending org invites.
 * @returns {Promise<Array<any>>}
 */
export async function checkPendingInvites() {
    const client = _client();
    const user = _user();
    const { data, error } = await client
        .from('org_invites')
        .select('id, org_id, org_role, token, expires_at, organizations(name)')
        .eq('email', (user.email || '').toLowerCase())
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString());
    if (error) {
        console.warn('[orgs] checkPendingInvites:', error.message);
        return [];
    }
    return data || [];
}
// ================================================================
// MUTATIONS
// ================================================================
/**
 * Create a new organization. Current user becomes owner.
 * @param {string} name
 * @returns {Promise<{id: string, slug: string}>}
 */
export async function createOrg(name: any) {
    const client = _client();
    const user = _user();
    const slug = generateOrgSlug(name);
    // Create org
    const { data: org, error: orgErr } = await client
        .from('organizations')
        .insert({ name, slug, owner_id: user.id })
        .select('id, slug')
        .single();
    if (orgErr) {
        // Slug conflict - retry with suffix
        if (orgErr.code === '23505') {
            const slug2 = slug + '-' + Date.now().toString(36).slice(-4);
            const { data: org2, error: orgErr2 } = await client
                .from('organizations')
                .insert({ name, slug: slug2, owner_id: user.id })
                .select('id, slug')
                .single();
            if (orgErr2) throw new Error(`Failed to create org: ${orgErr2.message}`);
            await _addOwnerMember(client, org2.id, user.id);
            return org2;
        }
        throw new Error(`Failed to create org: ${orgErr.message}`);
    }
    await _addOwnerMember(client, org.id, user.id);
    return org;
}
/**
 * @param {any} client
 * @param {any} orgId
 * @param {any} userId
 */
async function _addOwnerMember(client: any, orgId: any, userId: any) {
    await client.from('org_members').insert({
        org_id: orgId,
        user_id: userId,
        org_role: 'owner',
    });
}
/**
 * Invite a member to an organization.
 * @param {string} orgId
 * @param {string} email
 * @param {string} [role='member']
 * @returns {Promise<{id: string, token: string}>}
 */
export async function inviteMember(orgId: any, email: any, role: any = "member") {
    const client = _client();
    const user = _user();
    // Check member limit
    const org = _userOrgs?.find((o: any) => o.id === orgId);
    if (org) {
        const { count } = await client
            .from('org_members')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', orgId);
        if (count >= org.maxMembers) {
            throw new Error(`Member limit reached (${org.maxMembers}). Upgrade plan.`);
        }
    }
    const { data, error } = await client
        .from('org_invites')
        .insert({
            org_id: orgId,
            email: email.toLowerCase().trim(),
            org_role: role,
            invited_by: user.id,
        })
        .select('id, token')
        .single();
    if (error) throw new Error(`Failed to invite: ${error.message}`);
    return data;
}
/**
 * Accept an organization invite by token.
 * @param {string} token
 * @returns {Promise<{orgId: string, orgName: string}>}
 */
export async function acceptInvite(token: any) {
    const client = _client();
    const user = _user();
    // Find invite
    const { data: invite, error: findErr } = await client
        .from('org_invites')
        .select('id, org_id, org_role, expires_at, organizations(name)')
        .eq('token', token)
        .is('accepted_at', null)
        .maybeSingle(); // 406-safe: token invalido/expirado/ja aceito retorna null (findErr/!invite tratado abaixo)
    if (findErr || !invite) throw new Error('Invalid or expired invite');
    if (new Date(invite.expires_at) < new Date()) throw new Error('Invite expired');
    // Add member
    await client.from('org_members').insert({
        org_id: invite.org_id,
        user_id: user.id,
        org_role: invite.org_role,
        invited_by: null,
    });
    // Mark accepted
    await client.from('org_invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);
    return { orgId: invite.org_id, orgName: invite.organizations?.name || '' };
}
/**
 * Cancel a pending invite.
 * @param {string} inviteId
 */
export async function cancelInvite(inviteId: any) {
    const client = _client();
    const { error } = await client.from('org_invites').delete().eq('id', inviteId);
    if (error) throw new Error(`Failed to cancel: ${error.message}`);
}
/**
 * Remove a member from an organization.
 * @param {string} orgId
 * @param {string} userId
 */
export async function removeMember(orgId: any, userId: any) {
    const client = _client();
    // Cannot remove owner
    const { data: org } = await client.from('organizations').select('owner_id').eq('id', orgId).maybeSingle(); // 406-safe: org may not exist (org?. tolerated below)
    if (org?.owner_id === userId) throw new Error('Cannot remove organization owner');
    const { error } = await client.from('org_members').delete().eq('org_id', orgId).eq('user_id', userId);
    if (error) throw new Error(`Failed to remove: ${error.message}`);
}
/**
 * Transfer organization ownership to another member.
 * @param {string} orgId
 * @param {string} newOwnerUserId
 */
export async function transferOwnership(orgId: any, newOwnerUserId: any) {
    const client = _client();
    const user = _user();
    // Update org owner_id
    await client.from('organizations').update({ owner_id: newOwnerUserId }).eq('id', orgId);
    // Update roles: old owner → admin, new owner → owner
    await client.from('org_members').update({ org_role: 'admin' }).eq('org_id', orgId).eq('user_id', user.id);
    await client.from('org_members').update({ org_role: 'owner' }).eq('org_id', orgId).eq('user_id', newOwnerUserId);
}
// ================================================================
// CONTEXT
// ================================================================
/**
 * Set the active organization for the current session.
 * @param {string} orgId
 */
export async function setActiveOrg(orgId: any) {
    if (!_userOrgs) await loadUserOrgs();
    _currentOrg = _userOrgs?.find((o: any) => o.id === orgId) || null;
    if (_currentOrg) {
        sessionStorage.setItem('ecbyts-active-org', orgId);
    } else {
        sessionStorage.removeItem('ecbyts-active-org');
    }
}
/**
 * Get the currently active organization.
 * @returns {{ id, name, slug, orgRole } | null}
 */
export function getActiveOrg() {
    return _currentOrg;
}
/**
 * Get current user's role in the active organization.
 * @returns {'owner'|'admin'|'member'|'guest'|null}
 */
export function getOrgRole() {
    return _currentOrg?.orgRole || null;
}
// ================================================================
// UTILITY
// ================================================================
// ================================================================
// PERMISSION GATES - wired to core/sharing/policy.js
// ================================================================
// Why a thin wrapper here: the pure policy module is the canonical
// rulebook (testable in node, code-gen-able to RLS). organizations.js
// owns the active org context, so a one-call gate here keeps every
// UI gate honest without each caller importing both modules.
/**
 * Check whether the current user can perform an action on the
 * active org (or on a specific resource share when provided).
 *
 * @param {string} action - One of ACTIONS.* from core/sharing/policy.js
 * @param {Object} [share?] - Optional resource share grant ({ scope, expiresAt })
 * @returns {boolean}
 */
export function canCurrent(action: any, share?: any) {
    const role = getOrgRole();
    if (!role) return false;
    const r = policyCan({ orgRole: role, action, share });
    return !!r.ok;
}
/**
 * Check whether the current user has at least the given org role.
 * Wrapper around hasRoleAtLeast() bound to active org.
 *
 * @param {'guest'|'member'|'admin'|'owner'} minRole
 * @returns {boolean}
 */
export function currentRoleAtLeast(minRole: any) {
    return hasRoleAtLeast(getOrgRole(), minRole);
}
// Re-export ACTIONS so UI handlers can do `canCurrent(ACTIONS.SHARE)`
// without importing the policy module directly.
export { ACTIONS };
/**
 * Generate a URL-safe slug from organization name.
 * @param {string} name
 * @returns {string}
 */
export function generateOrgSlug(name: any) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^a-z0-9]+/g, '-') // replace non-alphanum with hyphens
        .replace(/^-+|-+$/g, '') // trim hyphens
        .slice(0, 30);
}
