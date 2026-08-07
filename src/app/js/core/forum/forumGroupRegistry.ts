// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 1 — pure logic registry (in-memory + optional Supabase IO).

/* ================================================================
   FORUM GROUP REGISTRY — Knowledge Groups (Orkut-inspired)
   Comunidades de conhecimento adjacentes ao Libraries Marketplace.

   Cada Knowledge Group é uma comunidade focada em um topico
   (ex: "CONAMA 420 Practitioners", "EIS Methodology Working Group").
   Membros postam threads, comentam, votam, linkam Libraries/SPECs.

   Pure-logic exports (createGroup, listGroups, joinGroup, leaveGroup)
   sao testaveis em Node sem browser. IO Supabase e async com fallback
   silencioso para memoria local quando offline.
   ================================================================ */

type GroupVisibility = 'public' | 'private' | 'invite';
type MembershipRole = 'owner' | 'mod' | 'member';

interface ForumGroup {
    id: string;
    name: string;
    slug: string;
    description: string;
    topicTags: string[];
    ownerId: string;
    visibility: GroupVisibility;
    membersCount: number;
    createdAt: string;
}

interface ForumMembership {
    groupId: string;
    userId: string;
    role: MembershipRole;
    joinedAt: string;
}

// ----------------------------------------------------------------
// MODULE STATE (closure)
// ----------------------------------------------------------------

const groups: Map<string, ForumGroup> = new Map();

const memberships: Map<string, ForumMembership> = new Map();

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * Slugify para URL-safe identifier.
 */
import { slugify as _slugifyCanonical } from '../../utils/helpers/slugify.js';
export function slugify(input: string): string {
    return _slugifyCanonical(input, { separator: '-', maxLength: 64 });
}

interface GroupInput {
    id?: string;
    name: string;
    description?: string;
    topicTags?: string[];
    visibility?: GroupVisibility;
    ownerId: string;
}

/**
 * Validate group inputs. Throws on critical errors, returns sanitized object.
 */
export function validateGroupInput(input: GroupInput): {
    id: string;
    name: string;
    slug: string;
    description: string;
    topicTags: string[];
    visibility: GroupVisibility;
    ownerId: string;
} {
    if (!input || typeof input !== 'object') {
        throw new Error('forum.group.invalid_input');
    }
    const { name, ownerId } = input;
    if (typeof name !== 'string' || !name.trim()) {
        throw new Error('forum.group.name_required');
    }
    if (typeof ownerId !== 'string' || !ownerId.trim()) {
        throw new Error('forum.group.owner_required');
    }
    const slug = slugify(name);
    if (!slug) throw new Error('forum.group.slug_invalid');
    const id = input.id || `grp_${slug}_${Date.now().toString(36)}`;
    const description = typeof input.description === 'string' ? input.description.slice(0, 2000) : '';
    const rawTags = Array.isArray(input.topicTags) ? input.topicTags : [];
    const topicTags = Array.from(
        new Set(
            rawTags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.toLowerCase().trim().slice(0, 32)),
        ),
    ).slice(0, 10);
    const visibility = ['public', 'private', 'invite'].includes(String(input.visibility || ''))
        ? (input.visibility as GroupVisibility)
        : 'public';
    return { id, name: name.trim().slice(0, 120), slug, description, topicTags, visibility, ownerId };
}

function membershipKey(groupId: string, userId: string): string {
    return `${groupId}::${userId}`;
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Create a new Knowledge Group (in-memory). Owner becomes first member.
 */
export function createGroup(input: GroupInput): ForumGroup {
    const sane = validateGroupInput(input);
    if (groups.has(sane.id)) {
        throw new Error('forum.group.duplicate_id');
    }
    const now = new Date().toISOString();
    const group: ForumGroup = {
        id: sane.id,
        name: sane.name,
        slug: sane.slug,
        description: sane.description,
        topicTags: sane.topicTags,
        ownerId: sane.ownerId,
        visibility: sane.visibility,
        membersCount: 0,
        createdAt: now,
    };
    groups.set(group.id, group);
    // Owner é auto-member com role=owner
    joinGroup({ groupId: group.id, userId: sane.ownerId, role: 'owner' });
    return group;
}

/**
 * List groups, optionally filtered.
 */
export function listGroups(opts: { visibility?: GroupVisibility; memberId?: string; tag?: string } = {}): ForumGroup[] {
    let out = Array.from(groups.values());
    if (opts.visibility) {
        out = out.filter((g) => g.visibility === opts.visibility);
    }
    if (opts.memberId) {
        out = out.filter((g) => memberships.has(membershipKey(g.id, opts.memberId as string)));
    }
    if (opts.tag) {
        const t = String(opts.tag).toLowerCase();
        out = out.filter((g) => g.topicTags.includes(t));
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Get single group by id.
 */
export function getGroup(groupId: string): ForumGroup | null {
    return groups.get(groupId) || null;
}

/**
 * Idempotent join. If already member, returns existing membership.
 */
export function joinGroup(input: { groupId: string; userId: string; role?: MembershipRole }): ForumMembership {
    if (!input || !input.groupId || !input.userId) {
        throw new Error('forum.membership.invalid_input');
    }
    const group = groups.get(input.groupId);
    if (!group) throw new Error('forum.group.not_found');
    const key = membershipKey(input.groupId, input.userId);
    const existing = memberships.get(key);
    if (existing) return existing;
    const role: MembershipRole =
        input.role && ['owner', 'mod', 'member'].includes(input.role) ? input.role : 'member';
    const m: ForumMembership = {
        groupId: input.groupId,
        userId: input.userId,
        role,
        joinedAt: new Date().toISOString(),
    };
    memberships.set(key, m);
    group.membersCount += 1;
    return m;
}

/**
 * Leave group. Returns true if removed, false if not member.
 * Owner cannot leave own group (must transfer ownership first).
 */
export function leaveGroup(input: { groupId: string; userId: string }): boolean {
    if (!input || !input.groupId || !input.userId) {
        throw new Error('forum.membership.invalid_input');
    }
    const group = groups.get(input.groupId);
    if (!group) return false;
    const key = membershipKey(input.groupId, input.userId);
    const m = memberships.get(key);
    if (!m) return false;
    if (m.role === 'owner') {
        throw new Error('forum.membership.owner_cannot_leave');
    }
    memberships.delete(key);
    group.membersCount = Math.max(0, group.membersCount - 1);
    return true;
}

/**
 * List members of a group.
 */
export function listMembers(groupId: string): ForumMembership[] {
    const prefix = `${groupId}::`;
    const out: ForumMembership[] = [];
    for (const [k, v] of memberships.entries()) {
        if (k.startsWith(prefix)) out.push(v);
    }
    return out;
}

/**
 * Reset registry (test-only).
 */
export function _resetForumGroupRegistry(): void {
    groups.clear();
    memberships.clear();
}

// ----------------------------------------------------------------
// SUPABASE IO (async, fallback to in-memory on failure)
// ----------------------------------------------------------------

/**
 * Persist a group to Supabase. Silently falls back to in-memory only
 * if supabase client is not available or request fails.
 */
export async function persistGroupSupabase(group: ForumGroup): Promise<{ persisted: boolean; error?: string }> {
    try {
        const w = typeof window !== 'undefined' ? (window as any) : null;
        const sb = w?.supabase || null;
        if (!sb || typeof sb.from !== 'function') {
            return { persisted: false, error: 'supabase_unavailable' };
        }
        const { error } = await sb.from('forum_groups').upsert({
            id: group.id,
            name: group.name,
            slug: group.slug,
            description: group.description,
            topic_tags: group.topicTags,
            owner_id: group.ownerId,
            visibility: group.visibility,
            members_count: group.membersCount,
            created_at: group.createdAt,
        });
        if (error) {
            console.debug('[forum:persist_group_failed]', error.message || error);
            return { persisted: false, error: String(error.message || error) };
        }
        return { persisted: true };
    } catch (e) {
        console.debug('[forum:persist_group_exception]', (e as any)?.message || e);
        return { persisted: false, error: 'exception' };
    }
}
